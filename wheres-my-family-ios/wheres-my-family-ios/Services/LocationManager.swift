import Foundation
import CoreLocation
import UIKit

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = LocationManager()
    
    private let locationManager = CLLocationManager()
    private let backendUrl = URL(string: "https://northamerica-northeast2-wheres-my-family-499822.cloudfunctions.net/locations")!
    private let mantleKey = "923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b"
    
    @Published var lastLocation: CLLocation?
    @Published var isTrackingActive: Bool = false
    @Published var authStatus: CLAuthorizationStatus = .notDetermined
    @Published var logs: [String] = []
    
    private var isUpdatingLocation = false
    
    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10 // meters
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true
        
        self.authStatus = locationManager.authorizationStatus
        UIDevice.current.isBatteryMonitoringEnabled = true
        
        logDiagnostic("LocationManager initialized.")
    }
    
    func requestPermissions() {
        locationManager.requestAlwaysAuthorization()
    }
    
    func toggleTracking() {
        if isTrackingActive {
            stopTracking()
        } else {
            startTracking()
        }
    }
    
    func startTracking() {
        guard !isUpdatingLocation else { return }
        locationManager.startUpdatingLocation()
        locationManager.startMonitoringSignificantLocationChanges()
        isUpdatingLocation = true
        isTrackingActive = true
        logDiagnostic("📡 Location tracking started.")
    }
    
    func stopTracking() {
        guard isUpdatingLocation else { return }
        locationManager.stopUpdatingLocation()
        locationManager.stopMonitoringSignificantLocationChanges()
        isUpdatingLocation = false
        isTrackingActive = false
        logDiagnostic("🛑 Location tracking stopped.")
    }
    
    func logDiagnostic(_ message: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        let timeStr = formatter.string(from: Date())
        let formattedLog = "[\(timeStr)] \(message)"
        DispatchQueue.main.async {
            self.logs.insert(formattedLog, at: 0)
            if self.logs.count > 100 {
                self.logs.removeLast()
            }
        }
    }
    
    // MARK: - CLLocationManagerDelegate
    
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async {
            self.authStatus = manager.authorizationStatus
            self.logDiagnostic("Auth status changed: \(self.getAuthStatusString(manager.authorizationStatus))")
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        DispatchQueue.main.async {
            self.lastLocation = location
        }
        
        logDiagnostic("📍 Location updated: (\(String(format: "%.5f", location.coordinate.latitude)), \(String(format: "%.5f", location.coordinate.longitude))), Acc: \(Int(location.horizontalAccuracy))m")
        
        // Sync to GCP Backend with transparent E2EE
        syncLocationWithBackend(location)
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        logDiagnostic("⚠️ GPS Error: \(error.localizedDescription)")
    }
    
    // MARK: - Backend Sync with client-side E2EE
    
    private func syncLocationWithBackend(_ location: CLLocation) {
        let userName = UserDefaults.standard.string(forKey: "user_name") ?? "iPhone Native User"
        let batteryLevel = Int(UIDevice.current.batteryLevel * 100)
        let isCharging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
        
        // Prepare plaintext location data
        let latStr = String(location.coordinate.latitude)
        let lonStr = String(location.coordinate.longitude)
        
        // Zero Knowledge coordinate privacy via client-side AES-256-CBC
        let encryptedLat = CryptoService.shared.encryptString(latStr)
        let encryptedLon = CryptoService.shared.encryptString(lonStr)
        
        let payload: [String: Any] = [
            "name": userName,
            "latitude": encryptedLat,
            "longitude": encryptedLon,
            "battery": batteryLevel,
            "is_charging": isCharging,
            "accuracy": Int(location.horizontalAccuracy),
            "timestamp": Int64(location.timestamp.timeIntervalSince1970 * 1000)
        ]
        
        var request = URLRequest(url: backendUrl)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(mantleKey, forHTTPHeaderField: "X-Mantle-Key")
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        } catch {
            logDiagnostic("❌ Serialization error: \(error.localizedDescription)")
            return
        }
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                self.logDiagnostic("❌ Network sync failed: \(error.localizedDescription)")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                    self.logDiagnostic("✅ Synced securely to backend.")
                } else {
                    self.logDiagnostic("❌ Sync failed with status code: \(httpResponse.statusCode)")
                }
            }
        }
        task.resume()
    }
    
    private func getAuthStatusString(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: return "Not Determined"
        case .restricted: return "Restricted"
        case .denied: return "Denied"
        case .authorizedAlways: return "Always"
        case .authorizedWhenInUse: return "When In Use"
        @unknown default: return "Unknown"
        }
    }
}
