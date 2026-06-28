package com.example.wheres_my_family_android.services

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.example.wheres_my_family_android.MainActivity
import com.example.wheres_my_family_android.data.TrailPoint
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.boolean

class BackgroundLocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private val serviceScope = CoroutineScope(Dispatchers.IO)
    private var pollJob: Job? = null
    private var currentInterval: Long = 30000L

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val NUDGE_NOTIFICATION_ID = 2002
        private const val CHANNEL_ID = "location_tracking_channel"
        private const val CHANNEL_NAME = "Location Tracking"
        private const val HIGH_ALERT_CHANNEL_ID = "nudge_alert_channel"
        private const val HIGH_ALERT_CHANNEL_NAME = "Family Nudge Alerts"
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val lastLocation = locationResult.lastLocation ?: return
                onNewLocation(lastLocation)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = SecurePreferencesService(applicationContext)
        currentInterval = prefs.getStandardInterval()

        startForegroundService()
        startLocationUpdates(currentInterval)
        startBackgroundPolling()
        return START_STICKY
    }

    private fun startForegroundService() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)

            val alertChannel = NotificationChannel(
                HIGH_ALERT_CHANNEL_ID,
                HIGH_ALERT_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
            }
            manager.createNotificationChannel(alertChannel)
        }

        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Where's my family!! Active")
            .setContentText("Sharing your live location with your family in the background.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startLocationUpdates(interval: Long) {
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
            .setMinUpdateIntervalMillis(interval / 3)
            .build()

        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            DiagnosticLogger.addDiagnosticLog("[GPS] Started location updates at interval: ${interval}ms")
        } catch (unlikely: SecurityException) {
            DiagnosticLogger.addDiagnosticLog("[GPS Error] Lost location permissions: ${unlikely.message}")
        }
    }

    private fun onNewLocation(location: Location) {
        val prefs = SecurePreferencesService(applicationContext)
        val userName = prefs.getUserName()
        val familyKey = prefs.getCustomFamilyKey()
        if (userName.isNotEmpty()) {
            serviceScope.launch {
                // 1. Fetch current weather context
                val weather = WeatherService.getWeatherAndAlertsCached(location.latitude, location.longitude)

                // 2. Fetch and append to local 24h trail history
                val now = System.currentTimeMillis()
                val oneDayAgo = now - 24 * 60 * 60 * 1000
                val rawTrail = prefs.getLocalTrail()
                val filteredTrail = rawTrail.filter { it.timestamp > oneDayAgo }.toMutableList()

                filteredTrail.add(
                    TrailPoint(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        timestamp = now
                    )
                )

                // Cap local trail at last 150 points to prevent storage inflation
                val finalTrail = if (filteredTrail.size > 150) {
                    filteredTrail.subList(filteredTrail.size - 150, filteredTrail.size)
                } else {
                    filteredTrail
                }
                prefs.saveLocalTrail(finalTrail)

                // 3. Publish location with local trail & weather context
                DiagnosticLogger.addDiagnosticLog("[Publish] Uploading encrypted background coordinates. Trail size: ${finalTrail.size}")
                val success = ApiClient.publishLocation(
                    name = userName,
                    latitude = location.latitude,
                    longitude = location.longitude,
                    familyKey = familyKey,
                    status = "Background Tracking",
                    battery = getBatteryLevel(),
                    charging = isBatteryCharging(),
                    deviceStatus = "Active",
                    platform = "android",
                    trail = finalTrail,
                    weatherTemp = weather?.temp,
                    weatherEmoji = weather?.emoji,
                    weatherDesc = weather?.desc,
                    weatherIsSevere = weather?.isSevere ?: false
                )
                if (success) {
                    DiagnosticLogger.addDiagnosticLog("[Publish Success] Background coordinates synced.")
                } else {
                    DiagnosticLogger.addDiagnosticLog("[Publish Error] Server sync failed.")
                }
            }
        }
    }

    private fun startBackgroundPolling() {
        pollJob?.cancel()
        pollJob = serviceScope.launch {
            val prefs = SecurePreferencesService(applicationContext)
            while (true) {
                val userName = prefs.getUserName()
                val familyKey = prefs.getCustomFamilyKey()
                if (userName.isNotEmpty()) {
                    try {
                        val rawJson = ApiClient.fetchLocations()
                        val json = Json { ignoreUnknownKeys = true }
                        val rootObj = json.parseToJsonElement(rawJson).jsonObject
                        
                        // Parse _config if present
                        rootObj["_config"]?.let { configElement ->
                            val configObj = configElement.jsonObject
                            configObj["settings"]?.let { settingsElement ->
                                val settingsObj = settingsElement.jsonObject
                                val remoteStandard = settingsObj["standardInterval"]?.jsonPrimitive?.long
                                val remoteFast = settingsObj["fastInterval"]?.jsonPrimitive?.long
                                
                                if (remoteStandard != null && remoteStandard != prefs.getStandardInterval()) {
                                    prefs.saveStandardInterval(remoteStandard)
                                    if (currentInterval != remoteStandard) {
                                        currentInterval = remoteStandard
                                        startLocationUpdates(currentInterval)
                                    }
                                }
                                if (remoteFast != null && remoteFast != prefs.getFastInterval()) {
                                    prefs.saveFastInterval(remoteFast)
                                }
                            }
                        }

                        // Parse member node for nudges or pings
                        if (rootObj.containsKey(userName)) {
                            val userObj = rootObj[userName]?.jsonObject
                            val nudgeRequested = userObj?.get("nudgeRequested")?.jsonPrimitive?.boolean ?: false
                            val pingRequested = userObj?.get("pingRequested")?.jsonPrimitive?.boolean ?: false

                            if (nudgeRequested) {
                                handleInboundNudge(userName)
                            }

                            if (pingRequested) {
                                handleInboundPing(userName, familyKey)
                            }
                        }
                    } catch (e: Exception) {
                        // Fail silently inside background polling loops
                    }
                }
                delay(20000) // Poll every 20 seconds
            }
        }
    }

    private suspend fun handleInboundNudge(userName: String) {
        DiagnosticLogger.addDiagnosticLog("[Nudge] RECEIVED a nudge vibration request in background!")
        
        // Vibrate device
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        val pattern = longArrayOf(0, 500, 200, 500)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(pattern, -1)
        }

        // Post highly visible notification
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(this, HIGH_ALERT_CHANNEL_ID)
            .setContentTitle("📳 Family Nudge!")
            .setContentText("Someone in your family is nudging you to check in!")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        manager.notify(NUDGE_NOTIFICATION_ID, notification)

        // Clear Server nudge request state
        ApiClient.clearNudgeState(userName)
    }

    private suspend fun handleInboundPing(userName: String, familyKey: String) {
        DiagnosticLogger.addDiagnosticLog("[Ping] RECEIVED a ping request in background! Responding immediately.")
        
        try {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                fusedLocationClient.lastLocation.addOnSuccessListener { loc: Location? ->
                    if (loc != null) {
                        serviceScope.launch {
                            val weather = WeatherService.getWeatherAndAlertsCached(loc.latitude, loc.longitude)
                            ApiClient.publishLocation(
                                name = userName,
                                latitude = loc.latitude,
                                longitude = loc.longitude,
                                familyKey = familyKey,
                                status = "Ping Response (BG)",
                                battery = getBatteryLevel(),
                                charging = isBatteryCharging(),
                                deviceStatus = "Active",
                                platform = "android",
                                trail = SecurePreferencesService(applicationContext).getLocalTrail(),
                                weatherTemp = weather?.temp,
                                weatherEmoji = weather?.emoji,
                                weatherDesc = weather?.desc,
                                weatherIsSevere = weather?.isSevere ?: false,
                                extraData = mapOf("pingRequested" to kotlinx.serialization.json.JsonPrimitive(false))
                            )
                            DiagnosticLogger.addDiagnosticLog("[Ping Success] Responded to background ping.")
                        }
                    }
                }
            }
        } catch (e: Exception) {
            DiagnosticLogger.addDiagnosticLog("[Background Ping Error] Failed: ${e.message}")
        }
    }

    private fun getBatteryLevel(): Int {
        val intent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) {
            (level * 100 / scale.toFloat()).toInt()
        } else {
            100
        }
    }

    private fun isBatteryCharging(): Boolean {
        val intent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val status = intent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
                status == android.os.BatteryManager.BATTERY_STATUS_FULL
    }

    override fun onDestroy() {
        super.onDestroy()
        pollJob?.cancel()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}
