package com.example.wheres_my_family_android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.wheres_my_family_android.theme.WheresMyFamilyAndroidTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Initialize diagnostic logger
    com.example.wheres_my_family_android.services.DiagnosticLogger.init(applicationContext)
    com.example.wheres_my_family_android.services.DiagnosticLogger.addDiagnosticLog("[System] Application initialized.")

    enableEdgeToEdge()
    setContent {
      WheresMyFamilyAndroidTheme { Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() } }
    }
  }
}
