package com.example.wheres_my_family_android.ui.main

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.wheres_my_family_android.services.DiagnosticLogger

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogTerminalDrawer(
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val logs by DiagnosticLogger.logsFlow.collectAsState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF020617), // Deep slate black
        dragHandle = {
            BottomSheetDefaults.DragHandle(color = Color(0xFF475569))
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "📟 Diagnostics Log Console",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF38BDF8)
                )
                
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = ClipData.newPlainText("Diagnostic Logs", logs.joinToString("\n"))
                            clipboard.setPrimaryClip(clip)
                        },
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF34D399))
                    ) {
                        Text("📋 Copy")
                    }

                    TextButton(
                        onClick = { DiagnosticLogger.clearLogs() },
                        colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFF87171))
                    ) {
                        Text("🗑️ Clear")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Console Terminal View
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(Color(0xFF090D16), RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                if (logs.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No diagnostic logs written yet.",
                            color = Color(0xFF64748B),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(logs) { log ->
                            val color = when {
                                log.contains("[Error", ignoreCase = true) || log.contains("Failed", ignoreCase = true) -> Color(0xFFF87171) // Soft Red
                                log.contains("[Warn", ignoreCase = true) -> Color(0xFFFBBF24) // Yellow
                                log.contains("[Publish Success", ignoreCase = true) -> Color(0xFF34D399) // Emerald Green
                                else -> Color(0xFFE2E8F0) // Cool gray
                            }
                            Text(
                                text = log,
                                color = color,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 12.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
