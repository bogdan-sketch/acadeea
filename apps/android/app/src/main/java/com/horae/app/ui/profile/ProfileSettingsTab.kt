package com.horae.app.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Power
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.SubcomposeAsyncImage
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.OrganizationBranding
import com.horae.app.data.remote.dto.UpdateCompanyRequest
import com.horae.app.domain.model.LocationType
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.common.HChip
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.dashboard.roCount
import com.horae.app.ui.stock.StockRoutes
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.navigation.hasExactRoute
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette

/**
 * Profil › Setări — the organisation (web `setari-tab.tsx`, iOS `ProfileSettingsTab`):
 * Companie, Locații, Categorii, Stoc (Revizie stocuri, Vânzări → stoc), Identitate (logo
 * light + dark), Echipă & roluri, Comenzi din site, Backup (root), Noutăți, Zonă periculoasă
 * (root). A strip of chips jumps to each section.
 */
@Composable
fun ProfileSettingsTab(
    viewModel: ProfileViewModel,
    navController: NavController,
    isRoot: Boolean,
    onAnchor: (String, Float) -> Unit,
    onJump: (String) -> Unit,
) {
    val anchors = buildList {
        add("companie" to "Companie"); add("locatii" to "Locații"); add("categorii" to "Categorii")
        add("stoc" to "Stoc"); add("identitate" to "Identitate"); add("echipa" to "Echipă & roluri")
        add("comenzi-site" to "Comenzi din site")
        if (isRoot) add("backup" to "Backup & restaurare")
        add("noutati" to "Noutăți")
        if (isRoot) add("zona-periculoasa" to "Zonă periculoasă")
    }
    fun Modifier.anchor(id: String) = onGloballyPositioned { onAnchor(id, it.positionInRoot().y) }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            anchors.forEach { (id, label) ->
                HChip(label, selected = false, onClick = { onJump(id) }, role = Role.Button)
            }
        }
        CompanySection(viewModel, Modifier.anchor("companie"))
        LocationsSection(viewModel, navController, Modifier.anchor("locatii"))
        CategoriesSection(viewModel, Modifier.anchor("categorii"))
        StockSection(navController, Modifier.anchor("stoc"))
        IdentitySection(viewModel, Modifier.anchor("identitate"))
        TeamSection(viewModel, navController, Modifier.anchor("echipa"))
        ShopSection(viewModel, navController, Modifier.anchor("comenzi-site"))
        if (isRoot) BackupSection(viewModel, Modifier.anchor("backup"))
        ReleaseSection(viewModel, navController, Modifier.anchor("noutati"))
        if (isRoot) DangerSection(navController, Modifier.anchor("zona-periculoasa"))
    }
}

// ── Companie ───────────────────────────────────────────────────────────

@Composable
private fun CompanySection(viewModel: ProfileViewModel, modifier: Modifier) {
    val org = viewModel.org
    var editing by rememberSaveable { mutableStateOf(false) }
    ProfileSection(
        "Companie",
        "Datele firmei tipărite pe avize, etichete și declarații.",
        modifier = modifier,
        footer = if (!editing && org != null) {
            {
                Spacer(Modifier.weight(1f))
                ProfileWordButton("Editează", Icons.Outlined.Edit, onClick = { editing = true })
            }
        } else null,
    ) {
        when {
            org == null -> LoadingRow()
            editing -> CompanyForm(org, viewModel, onDone = { editing = false })
            else -> {
                val vat = when (org.vatPayer) {
                    true -> "Plătitor de TVA · ${RoFormat.percent(org.vatRatePercent ?: 0.0, 0)}"
                    false -> "Neplătitor de TVA"
                    null -> null
                }
                ProfileRow(org.name, listOfNotNull(org.cui?.takeIf { it.isNotBlank() }?.let { "CUI $it" }, org.regCom?.takeIf { it.isNotBlank() }).joinToString(" · ").ifBlank { null })
                listOfNotNull(
                    org.legalAddress?.takeIf { it.isNotBlank() }?.let { "Sediu" to it },
                    listOfNotNull(org.contactPhone, org.contactEmail).filter { it.isNotBlank() }.joinToString(" · ").takeIf { it.isNotBlank() }?.let { "Contact" to it },
                    org.administratorName?.takeIf { it.isNotBlank() }?.let { "Administrator" to it },
                    vat?.let { "TVA" to it },
                ).forEach { (label, value) ->
                    ProfileDivider()
                    ProfileRow(label, value)
                }
                if (org.cui.isNullOrBlank() && org.legalAddress.isNullOrBlank()) {
                    ProfileDivider()
                    ProfileRow("Date incomplete", "Completează CUI-ul și sediul pentru avize")
                }
            }
        }
    }
}

@Composable
private fun CompanyForm(org: OrganizationBranding, viewModel: ProfileViewModel, onDone: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(org.name) }
    var cui by rememberSaveable { mutableStateOf(org.cui.orEmpty()) }
    var regCom by rememberSaveable { mutableStateOf(org.regCom.orEmpty()) }
    var address by rememberSaveable { mutableStateOf(org.legalAddress.orEmpty()) }
    var phone by rememberSaveable { mutableStateOf(org.contactPhone.orEmpty()) }
    var email by rememberSaveable { mutableStateOf(org.contactEmail.orEmpty()) }
    var website by rememberSaveable { mutableStateOf(org.website.orEmpty()) }
    var admin by rememberSaveable { mutableStateOf(org.administratorName.orEmpty()) }
    var vatPayer by rememberSaveable { mutableStateOf(org.vatPayer ?: true) }
    var vatRate by rememberSaveable { mutableStateOf(RoFormat.inputText(org.vatRatePercent ?: 21.0, 1)) }
    val rate = RoFormat.parseDecimal(vatRate)
    val valid = name.isNotBlank() && (!vatPayer || (rate != null && rate in 0.0..100.0))
    val s = HoraeTheme.scheme

    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ProfileTextField("Denumire", name, { name = it })
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileTextField("CUI", cui, { cui = it }, Modifier.weight(1f))
            ProfileTextField("Nr. Reg. Com.", regCom, { regCom = it }, Modifier.weight(1f))
        }
        ProfileTextField("Sediu social", address, { address = it })
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileTextField("Telefon", phone, { phone = it }, Modifier.weight(1f), keyboardType = KeyboardType.Phone)
            ProfileTextField("Email", email, { email = it }, Modifier.weight(1f), keyboardType = KeyboardType.Email)
        }
        ProfileTextField("Website", website, { website = it }, keyboardType = KeyboardType.Uri)
        ProfileTextField("Administrator", admin, { admin = it })
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Plătitor de TVA", style = AppFont.body(15f, FontWeight.SemiBold), color = s.ink, modifier = Modifier.weight(1f))
            Switch(
                checked = vatPayer,
                onCheckedChange = { vatPayer = it },
                colors = SwitchDefaults.colors(checkedTrackColor = s.primary, checkedThumbColor = s.onPrimary),
            )
        }
        if (vatPayer) {
            ProfileTextField(
                "Cota TVA (%)",
                vatRate,
                { vatRate = RoFormat.sanitizeDecimalInput(it, maxDecimals = 1) },
                keyboardType = KeyboardType.Decimal,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Spacer(Modifier.weight(1f))
            ProfileWordButton("Anulează", null, onClick = onDone)
            ProfileWordButton(
                "Salvează",
                null,
                tone = ProfileTone.PRIMARY,
                enabled = valid,
                busy = viewModel.isSavingCompany,
                onClick = {
                    viewModel.saveCompany(
                        UpdateCompanyRequest(
                            name = name.trim(), cui = cui.trim(), regCom = regCom.trim(),
                            legalAddress = address.trim(), contactPhone = phone.trim(),
                            contactEmail = email.trim(), website = website.trim(),
                            administratorName = admin.trim(), vatPayer = vatPayer,
                            vatRatePercent = if (vatPayer) rate ?: 0.0 else 0.0,
                        ),
                        onDone,
                    )
                },
            )
        }
    }
}

// ── Locații ────────────────────────────────────────────────────────────

@Composable
private fun LocationsSection(viewModel: ProfileViewModel, navController: NavController, modifier: Modifier) {
    val defaultId = viewModel.org?.defaultLocationId
    ProfileSection(
        "Locații",
        "Locația implicită e cea cu care pornește fiecare operațiune.",
        modifier = modifier,
        footer = {
            Spacer(Modifier.weight(1f))
            ProfileWordButton("Toate locațiile", Icons.Outlined.Place, onClick = { navController.navigate(Screen.LocationList.route) })
        },
    ) {
        if (!viewModel.locationsLoaded) LoadingRow()
        if (viewModel.locationsLoaded && viewModel.locations.isEmpty()) ProfileRow("Nicio locație", "Adaugă una din Toate locațiile")
        viewModel.locations.forEachIndexed { i, location ->
            if (i > 0) ProfileDivider()
            val type = LocationType.fromString(location.type)?.displayName ?: location.type
            ProfileRow(
                location.name,
                listOf(type, location.address).filter { it.isNotBlank() }.joinToString(" · "),
                onClick = { navController.navigate(Screen.LocationDashboard.createRoute(location.id)) },
                end = if (viewModel.wooDeliveryEnabled && location.isMainUnit) {
                    { HStatusChip("Principală", StatusKind.READY) }
                } else null,
            ) {
                if (location.id == defaultId) {
                    ProfilePill("Implicită")
                } else {
                    ProfileWordButton(
                        "Fă implicită",
                        Icons.Outlined.Star,
                        onClick = { viewModel.makeDefault(location) },
                        busy = viewModel.settingDefault == location.id,
                        enabled = viewModel.settingDefault == null,
                    )
                }
            }
        }
    }
}

// ── Categorii ──────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoriesSection(viewModel: ProfileViewModel, modifier: Modifier) {
    val s = HoraeTheme.scheme
    val groups = viewModel.categoryGroups
    ProfileSection(
        "Categorii",
        "Ordinea de aici e ordinea din Stoc și Rețete, pe web, iPhone și Android.",
        modifier = modifier,
    ) {
        if (groups == null) {
            LoadingRow()
        } else {
            groups.forEachIndexed { i, (label, list) ->
                if (i > 0) ProfileDivider()
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Text(
                        "$label · ${roCount(list.size, "categorie", "categorii")}",
                        style = AppFont.body(15f, FontWeight.SemiBold),
                        color = s.ink,
                    )
                    if (list.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            list.forEach { name ->
                                Text(
                                    name,
                                    style = AppFont.body(13f, FontWeight.SemiBold),
                                    color = s.ink,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .background(s.background)
                                        .border(1.dp, s.border, RoundedCornerShape(50))
                                        .padding(horizontal = 10.dp, vertical = 5.dp),
                                )
                            }
                        }
                    }
                }
            }
            ProfileDivider()
            ProfileRow("Adaugi, redenumești și ordonezi", "Din ${com.horae.app.BuildConfig.BRAND_NAME} pe web: Profil › Setări › Categorii")
        }
    }
}

// ── Stoc ───────────────────────────────────────────────────────────────

@Composable
private fun StockSection(navController: NavController, modifier: Modifier) {
    val hasReview = navController.hasExactRoute(StockRoutes.STOCK_REVIEW)
    val hasSales = navController.hasExactRoute(StockRoutes.SALES_DEDUCTIONS)
    ProfileSection("Stoc", "Revizia stocurilor și vânzările din magazin scăzute din stoc.", modifier = modifier) {
        if (hasReview) {
            ProfileRow("Revizie stocuri", "Excel cu tot stocul pe loturi, pentru inventar", glyph = Icons.Outlined.Checklist,
                onClick = { navController.navigate(StockRoutes.STOCK_REVIEW) })
        }
        if (hasSales) {
            ProfileDivider()
            ProfileRow("Vânzări → stoc", "Rapoartele de vânzări încărcate scad produsele din stoc",
                glyph = Icons.AutoMirrored.Outlined.ReceiptLong, onClick = { navController.navigate(StockRoutes.SALES_DEDUCTIONS) })
        }
        ProfileDivider()
        ProfileRow("Transferuri", "Mută stoc între locații", glyph = Icons.Outlined.SwapHoriz,
            onClick = { navController.navigate(Screen.TransferList.route) })
        Spacer(Modifier.height(6.dp))
    }
}

// ── Identitate ─────────────────────────────────────────────────────────

@Composable
private fun IdentitySection(viewModel: ProfileViewModel, modifier: Modifier) {
    var confirm by remember { mutableStateOf<LogoSlot?>(null) }
    ProfileSection(
        "Identitate",
        "Logo-ul firmei: Panou, bara laterală și avizele. Culorile vin din cele șase scheme.",
        modifier = modifier,
        footer = {
            Text("PNG transparent · fără logo se afișează numele firmei", style = AppFont.body(12f), color = HoraeTheme.scheme.muted)
        },
    ) {
        LogoSlot.entries.forEachIndexed { i, slot ->
            if (i > 0) ProfileDivider()
            LogoSlotRow(viewModel, slot, onRemove = { confirm = slot })
        }
        Spacer(Modifier.height(6.dp))
    }
    confirm?.let { slot ->
        ConfirmDialog(
            title = "Ștergi logo-ul?",
            text = if (slot == LogoSlot.DARK) "Pe schemele întunecate se va folosi logo-ul deschis." else "Se va afișa numele firmei.",
            confirm = "Șterge logo-ul",
            onConfirm = { confirm = null; viewModel.clearLogo(slot) },
            onDismiss = { confirm = null },
        )
    }
}

@Composable
private fun LogoSlotRow(viewModel: ProfileViewModel, slot: LogoSlot, onRemove: () -> Unit) {
    val s = HoraeTheme.scheme
    val branding = viewModel.brandingManager
    val raw = branding.logoFor(slot == LogoSlot.DARK)
    val revision = HoraeImages.logoRevision
    val model = remember(raw, revision) { HoraeImages.model(raw, revision) }
    val working = viewModel.logoWorking == slot
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.uploadLogo(slot, uri)
    }
    // The preview tile uses the background the logo is meant for.
    val tileBg = if (slot == LogoSlot.DARK) androidx.compose.ui.graphics.Color(0xFF1A1416) else androidx.compose.ui.graphics.Color(0xFFF6F3EE)
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(width = 96.dp, height = 72.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(tileBg)
                .border(1.dp, s.border, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (model != null) {
                SubcomposeAsyncImage(
                    model = model,
                    contentDescription = slot.title,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.padding(8.dp),
                )
            } else {
                Text(
                    branding.organizationName.take(1).uppercase(),
                    style = AppFont.title(26f),
                    color = if (slot == LogoSlot.DARK) androidx.compose.ui.graphics.Color.White else s.primaryText,
                )
            }
            if (working) CircularProgressIndicator(color = s.primary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(slot.title, style = AppFont.body(15f, FontWeight.SemiBold), color = s.ink)
            Text(slot.subtitle, style = AppFont.body(12f), color = s.muted)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProfileWordButton(
                    "Încarcă",
                    Icons.Outlined.FileUpload,
                    onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = viewModel.logoWorking == null,
                )
                if (raw != null) {
                    ProfileWordButton("Șterge", Icons.Outlined.DeleteOutline, onClick = onRemove, tone = ProfileTone.DANGER,
                        enabled = viewModel.logoWorking == null)
                }
            }
        }
    }
}

// ── Echipă & roluri ────────────────────────────────────────────────────

@Composable
private fun TeamSection(viewModel: ProfileViewModel, navController: NavController, modifier: Modifier) {
    val people = viewModel.peopleCount
    val title = people?.let { roCount(it, "persoană", "persoane") + " în echipă" } ?: "Echipa"
    val subtitle = if (viewModel.pendingInvites > 0) roCount(viewModel.pendingInvites, "invitație în așteptare", "invitații în așteptare") else null
    ProfileSection("Echipă & roluri", "Persoane, invitații și drepturile fiecărui rol.", modifier = modifier) {
        ProfileRow(title, subtitle, glyph = Icons.Outlined.Group, onClick = { navController.navigate(Screen.UserList.route) })
        ProfileDivider()
        ProfileRow(
            "Roluri și permisiuni",
            viewModel.rolesCount?.let { roCount(it, "rol", "roluri") } ?: "Ce poate vedea și face fiecare rol",
            glyph = Icons.Outlined.Lock,
            onClick = { navController.navigate(Screen.RoleList.route) },
        )
        Spacer(Modifier.height(6.dp))
    }
}

// ── Comenzi din site ───────────────────────────────────────────────────

@Composable
private fun ShopSection(viewModel: ProfileViewModel, navController: NavController, modifier: Modifier) {
    val shop = viewModel.shop
    ProfileSection("Comenzi din site", "Comenzile din magazinul online intră singure în Comenzi.", modifier = modifier) {
        when {
            viewModel.integrations == null -> LoadingRow()
            shop != null -> ProfileRow(
                shop.providerDisplayName,
                shopSubtitle(shop),
                glyph = Icons.Outlined.Power,
                onClick = { navController.navigate(Screen.IntegrationDetail.createRoute(shop.id)) },
            ) {
                ProfileWordButton("Configurează", Icons.Outlined.Settings, onClick = { navController.navigate(Screen.IntegrationList.route) })
            }
            else -> ProfileRow("Nicio conexiune", "Comenzile se adaugă manual până conectezi magazinul", glyph = Icons.Outlined.Power) {
                ProfileWordButton("Conectează", Icons.Outlined.Power, onClick = { navController.navigate(Screen.IntegrationList.route) })
            }
        }
        ProfileDivider()
        ProfileRow(
            "Livrări din magazinul online",
            "Preia data și metoda de livrare din WooCommerce (pluginul Pickupia), ID extern și unitate principală la locații, filtre pe metoda de livrare la comenzi.",
            end = {
                val s = HoraeTheme.scheme
                Switch(
                    checked = viewModel.wooDeliveryEnabled,
                    onCheckedChange = viewModel::setWooDelivery,
                    enabled = !viewModel.isSavingWooDelivery,
                    colors = SwitchDefaults.colors(checkedTrackColor = s.primary, checkedThumbColor = s.onPrimary),
                )
            },
        )
        Spacer(Modifier.height(6.dp))
    }
}

private fun shopSubtitle(shop: IntegrationResponseDto): String {
    val state = when (shop.status) {
        "ACTIVE" -> "Conectat"
        "ERROR" -> "Eroare"
        else -> "Inactiv"
    }
    val sync = shop.lastSyncAt?.let { "ultima sincronizare ${RoDate.shortDateTime(it)}" } ?: "nicio sincronizare încă"
    val mapped = roCount(shop.mappingsCount, "produs legat", "produse legate") + " de rețete"
    return listOf(state, sync, mapped).joinToString(" · ")
}

// ── Backup (root) ──────────────────────────────────────────────────────

@Composable
private fun BackupSection(viewModel: ProfileViewModel, modifier: Modifier) {
    val snapshots = viewModel.snapshots
    val last = snapshots?.firstOrNull()
    val title = when {
        snapshots == null -> "Backup"
        last == null -> "Niciun backup încă"
        else -> "Ultimul backup: ${RoDate.shortDateTime(last.createdAt)} · ${if (last.auto) "automat" else "manual"}"
    }
    val subtitle = snapshots?.size?.takeIf { it > 0 }?.let { roCount(it, "salvare păstrată", "salvări păstrate") }
    ProfileSection(
        "Backup & restaurare",
        "Salvare automată în fiecare noapte; restaurarea se face din ${com.horae.app.BuildConfig.BRAND_NAME} pe web.",
        modifier = modifier,
        tag = "doar root",
    ) {
        ProfileRow(title, subtitle, glyph = Icons.Outlined.Backup) {
            ProfileWordButton("Backup acum", Icons.Outlined.Backup, onClick = viewModel::backupNow, busy = viewModel.isBackingUp)
        }
        Spacer(Modifier.height(6.dp))
    }
}

// ── Noutăți ────────────────────────────────────────────────────────────

@Composable
private fun ReleaseSection(viewModel: ProfileViewModel, navController: NavController, modifier: Modifier) {
    val release = viewModel.release
    ProfileSection("Noutăți", "Ce s-a schimbat în fiecare versiune.", modifier = modifier) {
        ProfileRow(
            release?.let { "Versiunea ${it.version} · ${RoDate.shortDate(it.date)}" } ?: "Noutăți",
            release?.title,
            glyph = Icons.Outlined.AutoAwesome,
            onClick = { navController.navigate(Screen.Changelog.route) },
        )
        Spacer(Modifier.height(6.dp))
    }
}

// ── Zonă periculoasă (root) ────────────────────────────────────────────

@Composable
private fun DangerSection(navController: NavController, modifier: Modifier) {
    ProfileSection(
        "Zonă periculoasă",
        "Resetare date: alegi exact ce se șterge.",
        modifier = modifier,
        tone = ProfileTone.DANGER,
        tag = "doar root",
    ) {
        ProfileRow("Resetare date", "Șterge datele organizației, pe categorii", glyph = Icons.Outlined.DeleteSweep) {
            ProfileWordButton("Resetează…", Icons.Outlined.DeleteSweep, onClick = { navController.navigate(Screen.DataReset.route) },
                tone = ProfileTone.DANGER)
        }
        Spacer(Modifier.height(6.dp))
    }
}

@Composable
private fun LoadingRow() {
    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.CenterStart) {
        CircularProgressIndicator(Modifier.size(20.dp), color = HoraeTheme.scheme.primary, strokeWidth = 2.dp)
    }
}
