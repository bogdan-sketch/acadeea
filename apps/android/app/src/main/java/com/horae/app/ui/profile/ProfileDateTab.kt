package com.horae.app.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.SchemePickerGrid
import com.horae.app.ui.theme.SchemeStore
import com.horae.app.ui.theme.StatusPalette
import com.horae.app.ui.tutorial.rememberTutorialCenter
import com.horae.app.ui.tutorial.tutorialAnchor

/** Profil › Date — the person's own data (web `date-tab.tsx`, iOS `ProfileDateTab`). */
@Composable
fun ProfileDateTab(
    viewModel: ProfileViewModel,
    navController: NavController,
    user: User?,
    role: UserRole,
    onLogout: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (user != null) {
            MyDataSection(viewModel, user, canEditName = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.USER))
            PhotoSection(viewModel, user)
            SecuritySection(viewModel, user)
        }
        PreferencesSection()
        ToolsSection(navController, isAdmin = role == UserRole.ADMINISTRATOR)
        RiskSection(viewModel, onDeleted = onLogout)
        LogoutButton(onLogout)
    }
}

// ── Datele mele ────────────────────────────────────────────────────────

@Composable
private fun MyDataSection(viewModel: ProfileViewModel, user: User, canEditName: Boolean) {
    var first by rememberSaveable(user.id, user.firstName) { mutableStateOf(user.firstName) }
    var last by rememberSaveable(user.id, user.lastName) { mutableStateOf(user.lastName) }
    val dirty = first.trim() != user.firstName || last.trim() != user.lastName
    val valid = first.isNotBlank() && last.isNotBlank()

    ProfileSection(
        "Datele mele",
        "Numele apare pe taskuri, mișcări de stoc și în jurnal.",
        footer = {
            Text(
                if (canEditName) "Numele tău, așa cum îl vede echipa" else "Numele îl schimbă un administrator",
                style = AppFont.body(13f),
                color = HoraeTheme.scheme.muted,
                modifier = Modifier.weight(1f),
            )
            if (canEditName) {
                ProfileWordButton(
                    "Salvează",
                    Icons.Outlined.Check,
                    onClick = { viewModel.saveName(user, first.trim(), last.trim()) },
                    tone = if (dirty && valid) ProfileTone.PRIMARY else ProfileTone.STANDARD,
                    enabled = dirty && valid,
                    busy = viewModel.isSavingName,
                )
            }
        },
    ) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ProfileTextField("Prenume", first, { first = it }, Modifier.weight(1f), readOnly = !canEditName)
                ProfileTextField("Nume", last, { last = it }, Modifier.weight(1f), readOnly = !canEditName)
            }
            ProfileTextField(
                "Email de autentificare",
                user.email,
                {},
                readOnly = true,
                hint = "Se schimbă din Echipă & roluri, de către un administrator.",
            )
            Column {
                Text("Rol", style = AppFont.body(13f, FontWeight.SemiBold), color = HoraeTheme.scheme.muted)
                Spacer(Modifier.height(6.dp))
                ProfilePill(user.roleLabel)
            }
        }
    }
}

// ── Poză de profil ─────────────────────────────────────────────────────

@Composable
private fun PhotoSection(viewModel: ProfileViewModel, user: User) {
    var confirmDelete by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.uploadAvatar(user, uri)
    }
    ProfileSection("Poză de profil", "Apare pe Panou și pe taskurile tale.") {
        Row(
            Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(contentAlignment = Alignment.Center) {
                UserAvatar(user, 72.dp)
                if (viewModel.isAvatarWorking) CircularProgressIndicator(color = HoraeTheme.scheme.primary)
            }
            Spacer(Modifier.width(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ProfileWordButton(
                    "Încarcă",
                    Icons.Outlined.FileUpload,
                    onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    enabled = !viewModel.isAvatarWorking,
                    modifier = Modifier.semantics { contentDescription = "Încarcă poza de profil" },
                )
                if (user.avatarUrl != null) {
                    ProfileWordButton(
                        "Șterge",
                        Icons.Outlined.DeleteOutline,
                        onClick = { confirmDelete = true },
                        tone = ProfileTone.DANGER,
                        enabled = !viewModel.isAvatarWorking,
                    )
                }
            }
        }
    }
    if (confirmDelete) {
        ConfirmDialog(
            title = "Ștergi poza de profil?",
            text = "Se vor afișa inițialele tale.",
            confirm = "Șterge poza",
            onConfirm = { confirmDelete = false; viewModel.deleteAvatar(user) },
            onDismiss = { confirmDelete = false },
        )
    }
}

// ── Securitate ─────────────────────────────────────────────────────────

@Composable
private fun SecuritySection(viewModel: ProfileViewModel, user: User) {
    ProfileSection("Securitate", "Parola contului tău.") {
        ProfileRow(
            "Parolă",
            "Îți trimitem un link pe email, valabil 30 de minute",
            glyph = Icons.Outlined.Key,
            modifier = Modifier.padding(bottom = 6.dp),
        ) {
            ProfileWordButton(
                "Schimbă parola",
                Icons.Outlined.Email,
                onClick = { viewModel.sendPasswordReset(user.email) },
                busy = viewModel.isSendingReset,
            )
        }
    }
}

// ── Preferințe ─────────────────────────────────────────────────────────

@Composable
private fun PreferencesSection() {
    val s = HoraeTheme.scheme
    val tutorial = rememberTutorialCenter()
    ProfileSection("Preferințe", "Doar pentru contul tău, pe acest dispozitiv.") {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Temă", style = AppFont.body(15f, FontWeight.SemiBold), color = s.ink, modifier = Modifier.weight(1f))
                Text(
                    "Acum: ${SchemeStore.scheme.label} · ${SchemeStore.scheme.kindLabel.lowercase()}",
                    style = AppFont.body(13f),
                    color = s.muted,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text("Trei scheme luminoase, trei întunecate — fiecare cu accentul ei.", style = AppFont.body(13f), color = s.muted)
            Spacer(Modifier.height(12.dp))
            SchemePickerGrid()
        }
        ProfileDivider()
        ProfileRow(
            "Tutorial",
            "Sfaturi pe ecran cât explorezi aplicația",
            glyph = Icons.Outlined.School,
            modifier = Modifier.tutorialAnchor("profile.tutorial"),
            onClick = { tutorial.setTutorialEnabled(!tutorial.enabled) },
            end = {
            Switch(
                checked = tutorial.enabled,
                onCheckedChange = { tutorial.setTutorialEnabled(it) },
                colors = SwitchDefaults.colors(
                    checkedTrackColor = s.primary,
                    checkedThumbColor = s.onPrimary,
                    uncheckedTrackColor = s.background,
                    uncheckedBorderColor = s.border,
                    uncheckedThumbColor = s.muted,
                ),
                modifier = Modifier.semantics { contentDescription = "Tutorial" },
            )
            },
        )
    }
}

// ── Unelte ─────────────────────────────────────────────────────────────

@Composable
private fun ToolsSection(navController: NavController, isAdmin: Boolean) {
    ProfileSection("Unelte", "Notificări, ajutor și rapoarte.") {
        ProfileRow("Notificări", "Comenzi noi, stoc scăzut, taskuri", glyph = Icons.Outlined.Notifications,
            onClick = { navController.navigate(Screen.Notifications.route) })
        ProfileDivider()
        ProfileRow("Centru de ajutor", "Ghiduri pas cu pas", glyph = Icons.AutoMirrored.Outlined.HelpOutline,
            onClick = { navController.navigate(Screen.HelpCenter.route) })
        if (isAdmin) {
            ProfileDivider()
            ProfileRow("Statistici", "Vânzări, producție, echipă", glyph = Icons.Outlined.BarChart,
                onClick = { navController.navigate(Screen.Analytics.route) })
        }
        Spacer(Modifier.height(6.dp))
    }
}

// ── Zonă de risc ───────────────────────────────────────────────────────

@Composable
private fun RiskSection(viewModel: ProfileViewModel, onDeleted: () -> Unit) {
    var show by remember { mutableStateOf(false) }
    ProfileSection("Zonă de risc", "Acțiune definitivă — nu se poate anula.", tone = ProfileTone.DANGER) {
        ProfileRow(
            "Șterge contul",
            "Datele personale se anonimizează; taskurile și mișcările rămân în istoric, fără numele tău.",
            modifier = Modifier.padding(bottom = 6.dp),
        ) {
            ProfileWordButton(
                "Șterge contul",
                Icons.Outlined.DeleteOutline,
                onClick = { viewModel.clearDeleteError(); show = true },
                tone = ProfileTone.DANGER,
            )
        }
    }
    if (show) {
        DeleteAccountDialog(
            isDeleting = viewModel.isDeletingAccount,
            errorMessage = viewModel.deleteError,
            onConfirm = { pwd -> viewModel.deleteAccount(pwd) { show = false; onDeleted() } },
            onDismiss = { if (!viewModel.isDeletingAccount) { show = false; viewModel.clearDeleteError() } },
        )
    }
}

@Composable
private fun DeleteAccountDialog(
    isDeleting: Boolean,
    errorMessage: String?,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val s = HoraeTheme.scheme
    val danger = StatusPalette.fg(StatusKind.DANGER, s.isDark)
    var password by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.card,
        title = { Text("Șterge contul", style = AppFont.title(22f), color = s.ink) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "Contul tău va fi dezactivat, datele personale anonimizate și vei fi deconectat de pe toate " +
                        "dispozitivele. Introdu parola curentă pentru a confirma.",
                    style = AppFont.body(14f),
                    color = s.ink,
                )
                androidx.compose.material3.OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Parola curentă") },
                    singleLine = true,
                    enabled = !isDeleting,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (errorMessage != null) Text(errorMessage, style = AppFont.body(13f), color = danger)
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(password) }, enabled = password.isNotBlank() && !isDeleting) {
                if (isDeleting) CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), color = danger, strokeWidth = 2.dp)
                else Text("Șterge contul", color = danger, style = AppFont.body(15f, FontWeight.Bold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isDeleting) { Text("Anulează", color = s.ink) }
        },
    )
}

// ── Deconectare ────────────────────────────────────────────────────────

@Composable
private fun LogoutButton(onLogout: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    HPrimaryButton(
        "Deconectare",
        onClick = { confirm = true },
        icon = Icons.AutoMirrored.Outlined.Logout,
        destructive = true,
        modifier = Modifier.fillMaxWidth(),
    )
    if (confirm) {
        ConfirmDialog(
            title = "Te deconectezi?",
            text = "Va trebui să te autentifici din nou.",
            confirm = "Deconectare",
            onConfirm = { confirm = false; onLogout() },
            onDismiss = { confirm = false },
        )
    }
}

@Composable
internal fun ConfirmDialog(
    title: String,
    text: String,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val s = HoraeTheme.scheme
    val danger = StatusPalette.fg(StatusKind.DANGER, s.isDark)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.card,
        title = { Text(title, style = AppFont.title(22f), color = s.ink) },
        text = { Text(text, style = AppFont.body(14f), color = s.ink) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirm, color = danger, style = AppFont.body(15f, FontWeight.Bold)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Anulează", color = s.ink) } },
    )
}
