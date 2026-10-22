package com.horae.app.ui.recipes

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.CreateRecipeRequest
import com.horae.app.data.remote.dto.RecipeComponentDto
import com.horae.app.data.remote.dto.RecipeDetailResponse
import com.horae.app.data.remote.dto.RecipeIngredientDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.testutil.Fixtures.material
import com.horae.app.testutil.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class RecipesTest {

    @get:Rule val main = MainDispatcherRule()

    // ── photos are off ───────────────────────────────────────────────────

    @Test fun `recipe photos are switched off`() {
        assertThat(RECIPE_PHOTOS_ENABLED).isFalse()
        assertThat(recipePhotoEntryVisible(canEditRecipe = true)).isFalse()
        assertThat(recipePhotoEntryVisible(canEditRecipe = false)).isFalse()
    }

    @Test fun `photo entry needs the flag and edit rights`() {
        assertThat(recipePhotoEntryVisible(canEditRecipe = true, enabled = true)).isTrue()
        assertThat(recipePhotoEntryVisible(canEditRecipe = false, enabled = true)).isFalse()
    }

    /** Guard: a recipe screen that touches photoUrl must go through the flag. */
    @Test fun `every recipe screen showing photos is gated by the flag`() {
        val dir = listOf("src/main/java/com/horae/app/ui/recipes", "app/src/main/java/com/horae/app/ui/recipes")
            .map(::File).firstOrNull { it.isDirectory } ?: return
        dir.listFiles { f -> f.extension == "kt" }!!.forEach { f ->
            val src = f.readText()
            if (src.contains("photoUrl") || src.contains("uploadPhoto")) {
                assertThat(src.contains("recipePhotoEntryVisible") || src.contains("RECIPE_PHOTOS_ENABLED")).isTrue()
            }
        }
    }

    // ── units ────────────────────────────────────────────────────────────

    @Test fun `new input is metric only`() {
        val solids = unitsInFamily(UnitType.GRAME)
        assertThat(solids).containsAtLeast(UnitType.OUNCES, UnitType.POUNDS) // family incl. legacy
        assertThat(selectableUnits(solids, UnitType.GRAME))
            .containsExactly(UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME).inOrder()
        assertThat(selectableUnits(unitsInFamily(UnitType.LITRI), UnitType.LITRI))
            .containsExactly(UnitType.MILILITRI, UnitType.LITRI).inOrder()
        assertThat(selectableUnits(UnitType.metricInputUnits, UnitType.BUCATI)).isEqualTo(UnitType.metricInputUnits)
    }

    @Test fun `a stored legacy unit stays selectable while it is the current value`() {
        assertThat(selectableUnits(unitsInFamily(UnitType.OUNCES), UnitType.OUNCES))
            .containsExactly(UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME, UnitType.OUNCES)
        // Yield unit sheet lists metricInputUnits; an old recipe in "căni" must still see it.
        assertThat(selectableUnits(UnitType.metricInputUnits, UnitType.CANI)).contains(UnitType.CANI)
        assertThat(selectableUnits(UnitType.metricInputUnits, UnitType.CANI).filter { it.isLegacy })
            .containsExactly(UnitType.CANI)
    }

    @Test fun `no choices falls back to metric input units`() {
        assertThat(selectableUnits(emptyList(), UnitType.GRAME)).isEqualTo(UnitType.metricInputUnits)
    }

    @Test fun `recipes default to small units`() {
        assertThat(defaultRecipeUnit(UnitType.KILOGRAME)).isEqualTo(UnitType.GRAME)
        assertThat(defaultRecipeUnit(UnitType.POUNDS)).isEqualTo(UnitType.GRAME)
        assertThat(defaultRecipeUnit(UnitType.LITRI)).isEqualTo(UnitType.MILILITRI)
        assertThat(defaultRecipeUnit(UnitType.BUCATI)).isEqualTo(UnitType.BUCATI)
        assertThat(unitOrNull("KILOGRAME")).isEqualTo(UnitType.KILOGRAME)
        assertThat(unitOrNull("kg")).isNull()
    }

    // ── form view model ──────────────────────────────────────────────────

    private val repo = mockk<RecipeRepository>()

    private fun detail(yieldQty: Double, ingredientQty: Double, unit: String = "KILOGRAME") = RecipeDetailResponse(
        id = "r1", name = "Tort fistic", unit = unit, yieldQuantity = yieldQty, type = "FINAL",
        components = listOf(
            RecipeComponentDto(
                id = "c1", name = "Blat",
                ingredients = listOf(
                    RecipeIngredientDto(id = "i1", rawMaterialId = "m1", name = "Vanilie", quantity = ingredientQty, unit = "KILOGRAME"),
                ),
            ),
        ),
    )

    private fun TestScope.vm(id: String? = null): RecipeFormViewModel {
        coEvery { repo.getCategories(any()) } returns listOf("Torturi")
        return RecipeFormViewModel(repo).also { it.start(id); advanceUntilIdle() }
    }

    @Test fun `editing shows quantities the Romanian way, never in scientific notation`() = runTest(main.dispatcher) {
        coEvery { repo.getRecipe("r1") } returns detail(yieldQty = 1.5, ingredientQty = 0.0001)
        val s = vm("r1").uiState.value
        assertThat(s.isEditing).isTrue()
        assertThat(s.yieldQuantityText).isEqualTo("1,5")
        val qty = s.components.single().ingredients.single().quantityText
        assertThat(qty).doesNotContain("E")
        assertThat(com.horae.app.ui.common.RoFormat.parseDecimal(qty)).isEqualTo(0.0001)
        assertThat(s.availableCategories).containsExactly("Torturi")
    }

    @Test fun `save parses Romanian decimals for yield and ingredients`() = runTest(main.dispatcher) {
        val sent = slot<CreateRecipeRequest>()
        coEvery { repo.createRecipe(capture(sent)) } returns detail(1.0, 1.0)
        val vm = vm()
        vm.onNameChange(" Cremă de vanilie ")
        vm.onYieldChange("1.250,5")
        vm.onUnitChange(UnitType.GRAME)
        val comp = vm.uiState.value.components.single()
        val ing = comp.ingredients.single()
        vm.selectRawMaterial(comp.id, ing.id, material("m1", "Lapte", unit = "LITRI"))
        vm.onIngredientQuantityChange(comp.id, ing.id, "1 000,5")
        assertThat(vm.uiState.value.canSave).isTrue()
        vm.save()
        advanceUntilIdle()
        val r = sent.captured
        assertThat(r.name).isEqualTo("Cremă de vanilie")
        assertThat(r.yieldQuantity).isEqualTo(1250.5)
        assertThat(r.unit).isEqualTo("GRAME")
        val line = r.components!!.single().ingredients.single()
        assertThat(line.quantity).isEqualTo(1000.5)
        assertThat(line.unit).isEqualTo("MILILITRI") // liquids default to ml
        assertThat(line.rawMaterialId).isEqualTo("m1")
        assertThat(vm.uiState.value.saved).isTrue()
    }

    @Test fun `cannot save without name, positive yield or an ingredient`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.onNameChange("Tort")
        vm.onYieldChange("abc")
        assertThat(vm.uiState.value.canSave).isFalse()
        vm.onYieldChange("2")
        assertThat(vm.uiState.value.canSave).isFalse() // no ingredient picked yet
        val comp = vm.uiState.value.components.single()
        vm.selectRawMaterial(comp.id, comp.ingredients.single().id, material("m1"))
        assertThat(vm.uiState.value.canSave).isTrue()
        vm.onYieldChange("0")
        assertThat(vm.uiState.value.canSave).isFalse()
    }

    @Test fun `picking a material offers its metric family, a semipreparat is fixed`() = runTest(main.dispatcher) {
        val vm = vm()
        val comp = vm.uiState.value.components.single()
        val ingId = comp.ingredients.single().id
        vm.selectRawMaterial(comp.id, ingId, material("m1", unit = "KILOGRAME"))
        var ing = vm.uiState.value.components.single().ingredients.single()
        assertThat(ing.unit).isEqualTo(UnitType.GRAME)
        assertThat(selectableUnits(ing.unitChoices, ing.unit)).containsExactly(UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME)
        vm.selectSemipreparat(comp.id, ingId, com.horae.app.testutil.Fixtures.recipe("s1", "Cremă", unit = "LITRI", type = "SEMIPREPARAT"))
        ing = vm.uiState.value.components.single().ingredients.single()
        assertThat(ing.isSemipreparat).isTrue()
        assertThat(ing.rawMaterialId).isNull()
        assertThat(ing.unit).isEqualTo(UnitType.LITRI)
        assertThat(ing.unitChoices).isEmpty()
    }
}
