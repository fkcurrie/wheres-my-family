package com.example.wheres_my_family_android.data

import kotlinx.serialization.Serializable

@Serializable
data class TrailPoint(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long = 0L
)

@Serializable
data class FamilyMember(
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val status: String = "Active",
    val battery: Int = 100,
    val charging: Boolean = false,
    val deviceStatus: String = "Active",
    val lastSeen: String = "Just now",
    val color: String = "#3b82f6",
    val updatedAt: Long = 0L,
    val platform: String = "unknown",
    val trail: List<TrailPoint> = emptyList(),
    val nudgeRequested: Boolean = false,
    val pingRequested: Boolean = false,
    val weatherTemp: Int? = null,
    val weatherEmoji: String? = null,
    val weatherDesc: String? = null,
    val weatherIsSevere: Boolean = false,
    val decryptionFailed: Boolean = false
)


