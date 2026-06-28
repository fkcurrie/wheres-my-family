package com.example.wheres_my_family_android.ui.main

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import com.example.wheres_my_family_android.data.FamilyMember
import com.example.wheres_my_family_android.services.OsrmService
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onItemClick: (NavKey) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val viewModel: MainScreenViewModel = viewModel {
        MainScreenViewModel(context.applicationContext)
    }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    // Map Trail Configurations
    var showTrails by remember { mutableStateOf(true) }
    var snapToRoads by remember { mutableStateOf(false) }

    // Map Camera controller
    val switzerland = LatLng(46.8182, 8.2275)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(switzerland, 4f)
    }

    // Local profile editing states
    var inputName by remember { mutableStateOf(uiState.userName) }
    var inputKey by remember { mutableStateOf(uiState.customKey) }
    var inputContacts by remember { mutableStateOf(uiState.emergencyContacts) }

    LaunchedEffect(uiState.userName, uiState.customKey, uiState.emergencyContacts) {
        inputName = uiState.userName
        inputKey = uiState.customKey
        inputContacts = uiState.emergencyContacts
    }

    // Snapped trails local cache: memberName -> points
    val snappedTrailsCache = remember { mutableStateMapOf<String, List<LatLng>>() }

    // React to changes in members' raw trails to refresh snapped coordinates
    LaunchedEffect(uiState.familyMembers, snapToRoads) {
        if (snapToRoads) {
            uiState.familyMembers.forEach { member ->
                if (member.trail.isNotEmpty()) {
                    coroutineScope.launch {
                        val snapped = OsrmService.fetchSnappedTrail(member.trail)
                        val latLngList = snapped.map { LatLng(it.latitude, it.longitude) }
                        snappedTrailsCache[member.name] = latLngList
                    }
                }
            }
        } else {
            snappedTrailsCache.clear()
        }
    }

    // Standard Permissions Launchers
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (fineGranted && uiState.isTrackingActive) {
            viewModel.toggleTracking(context, true)
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ -> }

    fun hasLocationPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun hasNotificationPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    // 1. Guard Onboarding Entry Screen
    if (uiState.showOnboarding) {
        OnboardingScreen(
            onComplete = { name, key ->
                viewModel.updateProfile(context, name, key)
            }
        )
        return
    }

    // Primary UI
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Where's my family!!",
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                            fontSize = 20.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        // Pulsing Neon Status Pill
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (uiState.isTrackingActive) Color(0xFF10B981) else Color(0xFFEF4444))
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.setShowingFeedback(true) }) {
                        Text("💬", fontSize = 20.sp, color = Color.White)
                    }
                    IconButton(onClick = {
                        val inviteMessage = """
                            Join our family tracking map on "Where's my family!!" 📍
                            Frank built this custom app just for our family to keep each other safe!

                            📱 FOR IPHONE (iOS) USERS:
                            1. Install the free "TestFlight" app from the App Store.
                            2. Tap our family join link to install "Where's my family!!":
                            https://testflight.apple.com/join/6780024343

                            🤖 FOR ANDROID USERS:
                            1. Tap this link to download and install our preview app (APK):
                            https://expo.dev/accounts/fkctor/projects/wheres-my-family/builds
                            (Download the latest "preview" build, click "Install", and allow installation if prompted by your browser).

                            ✨ ONCE INSTALLED:
                            - Open the app and enter your name to show up on the family map.
                            - IMPORTANT: Set Location permissions to "Always Allow" (Background Tracking) so we can keep each other safe even when the phone is locked in your pocket! 🔒
                        """.trimIndent()
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, inviteMessage)
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Share App Invite"))
                    }) {
                        Text("📤", fontSize = 20.sp, color = Color.White)
                    }
                    IconButton(onClick = { viewModel.setShowingSettings(true) }) {
                        Text("⚙", fontSize = 22.sp, color = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A)
                )
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(Color(0xFF020617)) // Deep slate black
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Interactive Google Map
                Box(
                    modifier = Modifier
                        .weight(1.3f)
                        .fillMaxSize()
                ) {
                    GoogleMap(
                        modifier = Modifier.fillMaxSize(),
                        cameraPositionState = cameraPositionState,
                        properties = MapProperties(
                            isMyLocationEnabled = hasLocationPermissions(),
                            mapType = MapType.NORMAL
                        ),
                        uiSettings = MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = true
                        )
                    ) {
                        // Drawing markers and routes for family members
                        uiState.familyMembers.forEach { member ->
                            Marker(
                                state = rememberMarkerState(position = LatLng(member.latitude, member.longitude)),
                                title = member.name,
                                snippet = "${member.status} | Battery: ${member.battery}%"
                            )

                            // Historical polyline trails
                            if (showTrails && member.trail.isNotEmpty()) {
                                val pointsToDraw = if (snapToRoads) {
                                    snappedTrailsCache[member.name] ?: member.trail.map { LatLng(it.latitude, it.longitude) }
                                } else {
                                    member.trail.map { LatLng(it.latitude, it.longitude) }
                                }

                                Polyline(
                                    points = pointsToDraw,
                                    color = Color(android.graphics.Color.parseColor(member.color)),
                                    width = 6f
                                )
                            }
                        }
                    }

                    // Map Filters / Toggles Overlay Panel
                    Column(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(12.dp)
                            .background(Color(0xFF0F172A).copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFF334155), RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = showTrails,
                                onCheckedChange = { showTrails = it },
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF38BDF8))
                            )
                            Text("Show Trails", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = snapToRoads,
                                onCheckedChange = { snapToRoads = it },
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF38BDF8)),
                                enabled = showTrails
                            )
                            Text("Snap to Roads", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Live sharing toggle floating card
                    Card(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B).copy(alpha = 0.9f)),
                        elevation = CardDefaults.cardElevation(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Text(
                                "Live Sharing",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Switch(
                                checked = uiState.isTrackingActive,
                                onCheckedChange = { active ->
                                    if (active) {
                                        if (!hasLocationPermissions()) {
                                            locationPermissionLauncher.launch(
                                                arrayOf(
                                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                                )
                                            )
                                        }
                                        if (!hasNotificationPermissions() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                        }
                                    }
                                    viewModel.toggleTracking(context, active)
                                }
                            )
                        }
                    }

                    // Dynamic announcements banner
                    androidx.compose.animation.AnimatedVisibility(
                        visible = uiState.announcement != null,
                        enter = slideInVertically() + fadeIn(),
                        exit = slideOutVertically() + fadeOut(),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(12.dp)
                    ) {
                        uiState.announcement?.let { ann ->
                            val (bgColor, icon) = when (ann.severity) {
                                "critical" -> Color(0xFF991B1B) to "⚠️ [CRITICAL]"
                                "warning" -> Color(0xFF9A3412) to "⚠️ [WARNING]"
                                "success" -> Color(0xFF065F46) to "✅ [UPDATE]"
                                else -> Color(0xFF1E40AF) to "📢 [INFO]"
                            }
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(containerColor = bgColor.copy(alpha = 0.9f))
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(icon, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                        Text(ann.message, color = Color.White, fontSize = 13.sp)
                                    }
                                    TextButton(onClick = { viewModel.dismissAnnouncement(ann.id) }) {
                                        Text("Dismiss", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                // Global Action Buttons Panel
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { viewModel.generateSmsSOS() },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("🚨 Send SOS SMS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { viewModel.setShowingSmsImport(true) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("📥 Import SMS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { viewModel.setShowingConsole(true) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1.1f)
                    ) {
                        Text("📟 Diagnostic Logs", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Family Members List Panel
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(Color(0xFF020617))
                ) {
                    if (uiState.familyMembers.isEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "No family members synced yet.",
                                color = Color(0xFF64748B),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(uiState.familyMembers) { member ->
                                FamilyCard(
                                    member = member,
                                    onCardClick = {
                                        coroutineScope.launch {
                                            cameraPositionState.animate(
                                                CameraUpdateFactory.newLatLngZoom(
                                                    LatLng(member.latitude, member.longitude),
                                                    14f
                                                )
                                            )
                                        }
                                    },
                                    onNudge = { viewModel.requestNudge(member) },
                                    onPing = { viewModel.requestPing(member) },
                                    onDelete = { viewModel.deleteMember(member) }
                                )
                            }
                        }
                    }
                }
            }

            // Bottom Sheets and Overlays Integration
            if (uiState.isShowingConsole) {
                LogTerminalDrawer(onDismiss = { viewModel.setShowingConsole(false) })
            }

            if (uiState.isShowingSmsImport) {
                SmsImportDialog(
                    familyKey = uiState.customKey,
                    onDismiss = { viewModel.setShowingSmsImport(false) },
                    onSuccess = { msg ->
                        viewModel.setShowingSmsImport(false)
                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                    }
                )
            }

            if (uiState.isShowingFeedback) {
                FeedbackDialog(
                    isSubmitting = uiState.isSubmittingFeedback,
                    statusMessage = uiState.feedbackStatusMessage,
                    onDismiss = { viewModel.setShowingFeedback(false) },
                    onSubmit = { category, title, details ->
                        viewModel.submitFeedback(category, title, details)
                    }
                )
            }

            // Copy-Paste Offline SMS SOS bottom sheet
            if (uiState.isShowingSmsSOSSheet) {
                AlertDialog(
                    onDismissRequest = { viewModel.setShowingSmsSOSSheet(false) },
                    title = {
                        Text("🚨 Dispatch SMS SOS", color = Color.White, fontWeight = FontWeight.Bold)
                    },
                    text = {
                        Column {
                            Text(
                                "Internet is offline. Copy the secure encrypted ciphertext payload below and text it to your family members.",
                                color = Color(0xFF94A3B8),
                                fontSize = 13.sp
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF090D16), RoundedCornerShape(8.dp))
                                    .padding(12.dp)
                            ) {
                                Text(
                                    uiState.localSmsSOSPayload,
                                    color = Color(0xFFF87171),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                viewModel.setShowingSmsSOSSheet(false)
                                try {
                                    val uriString = if (uiState.emergencyContacts.isNotEmpty()) {
                                        "smsto:${uiState.emergencyContacts}"
                                    } else {
                                        "smsto:"
                                    }
                                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                                        data = Uri.parse(uriString)
                                        putExtra("sms_body", uiState.localSmsSOSPayload)
                                    }
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Could not open SMS application.", Toast.LENGTH_SHORT).show()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                        ) {
                            Text("Open SMS App")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { viewModel.setShowingSmsSOSSheet(false) }) {
                            Text("Close", color = Color(0xFF94A3B8))
                        }
                    },
                    containerColor = Color(0xFF0F172A)
                )
            }

            // High Fidelity Settings Overlay
            if (uiState.isShowingSettings) {
                Dialog(onDismissRequest = { viewModel.setShowingSettings(false) }) {
                    Surface(
                        shape = RoundedCornerShape(24.dp),
                        color = Color(0xFF0F172A),
                        tonalElevation = 8.dp,
                        modifier = Modifier.fillMaxWidth().wrapContentHeight()
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Profile Settings", style = MaterialTheme.typography.headlineSmall, color = Color.White, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(16.dp))

                            OutlinedTextField(
                                value = inputName,
                                onValueChange = { inputName = it },
                                label = { Text("Your Name (e.g. Dad)") },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = Color(0xFF38BDF8),
                                    unfocusedBorderColor = Color(0xFF475569),
                                    focusedLabelColor = Color(0xFF38BDF8)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            OutlinedTextField(
                                value = inputKey,
                                onValueChange = { inputKey = it },
                                label = { Text("E2EE Family Passphrase") },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = Color(0xFF38BDF8),
                                    unfocusedBorderColor = Color(0xFF475569),
                                    focusedLabelColor = Color(0xFF38BDF8)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            OutlinedTextField(
                                value = inputContacts,
                                onValueChange = { inputContacts = it },
                                label = { Text("Emergency SMS Contacts (comma-separated)") },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White,
                                    focusedBorderColor = Color(0xFF38BDF8),
                                    unfocusedBorderColor = Color(0xFF475569),
                                    focusedLabelColor = Color(0xFF38BDF8)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(modifier = Modifier.height(24.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { viewModel.setShowingSettings(false) },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF94A3B8)),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Cancel")
                                }

                                Button(
                                    onClick = {
                                        viewModel.updateProfile(context, inputName, inputKey, inputContacts)
                                        viewModel.setShowingSettings(false)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0EA5E9)),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Save")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FamilyCard(
    member: FamilyMember,
    onCardClick: () -> Unit,
    onNudge: () -> Unit,
    onPing: () -> Unit,
    onDelete: () -> Unit
) {
    var showConfirmDelete by remember { mutableStateOf(false) }

    if (showConfirmDelete) {
        AlertDialog(
            onDismissRequest = { showConfirmDelete = false },
            title = { Text("Retire Node?", color = Color.White, fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to delete ${member.name}'s node from the database?", color = Color(0xFF94A3B8)) },
            confirmButton = {
                Button(
                    onClick = { onDelete(); showConfirmDelete = false },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("Retire")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDelete = false }) {
                    Text("Cancel", color = Color(0xFF94A3B8))
                }
            },
            containerColor = Color(0xFF0F172A)
        )
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onCardClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)), // Slate 800
        elevation = CardDefaults.cardElevation(3.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Member Initial Color Circle
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(Color(android.graphics.Color.parseColor(member.color))),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        member.name.take(1).uppercase(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Info columns
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            member.name,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        // Pulsing status dot
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981))
                        )
                    }
                    Text(
                        member.status,
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 2.dp)
                    ) {
                        Text(if (member.charging) "⚡" else "🔋", fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            "${member.battery}%",
                            fontSize = 11.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                }

                // Weather Badge column
                if (member.weatherTemp != null) {
                    Card(
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (member.weatherIsSevere) Color(0xFF991B1B) else Color(0xFF0F172A)
                        ),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(member.weatherEmoji ?: "☀️", fontSize = 12.sp)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("${member.weatherTemp}°C", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                            if (member.weatherIsSevere) {
                                Spacer(modifier = Modifier.width(2.dp))
                                Text("🚩", fontSize = 10.sp)
                            }
                        }
                    }
                }

                // Platform badge
                Text(
                    text = member.platform.uppercase(),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF38BDF8),
                    modifier = Modifier
                        .background(Color(0xFF0F172A), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Divider(color = Color(0xFF334155))
            Spacer(modifier = Modifier.height(8.dp))

            // Action Triggers Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = onNudge,
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF38BDF8)),
                        modifier = Modifier.height(36.dp)
                    ) {
                        Text("📳 Nudge Device", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    TextButton(
                        onClick = onPing,
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF38BDF8)),
                        modifier = Modifier.height(36.dp)
                    ) {
                        Text("📍 Ping GPS", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                IconButton(
                    onClick = { showConfirmDelete = true },
                    modifier = Modifier.size(36.dp)
                ) {
                    Text("🗑️", fontSize = 14.sp, color = Color(0xFFEF4444))
                }
            }
        }
    }
}
