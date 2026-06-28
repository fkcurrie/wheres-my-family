import SwiftUI
import MapKit

struct ContentView: View {
    @StateObject private var locationManager = LocationManager.shared
    @State private var userName: String = UserDefaults.standard.string(forKey: "user_name") ?? "iPhone Native User"
    @State private var customFamilyKey: String = UserDefaults.standard.string(forKey: "custom_family_key") ?? ""
    @State private var isEditingProfile = false
    
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 43.6532, longitude: -79.3832), // Toronto default
        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
    )
    
    var body: some View {
        ZStack {
            // 1. Sleek Live Map Background
            Map(coordinateRegion: $region, showsUserLocation: true, userTrackingMode: .constant(.follow))
                .ignoresSafeArea()
                .onReceive(locationManager.$lastLocation) { newLoc in
                    if let loc = newLoc {
                        withAnimation(.easeInOut(duration: 1.0)) {
                            region.center = loc.coordinate
                        }
                    }
                }
            
            // 2. Glassmorphic Overlays
            VStack {
                // Top Header: Branding and Settings Button
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Where's my family!!")
                            .font(.system(.title2, design: .rounded))
                            .bold()
                            .foregroundColor(.white)
                            .shadow(radius: 4)
                        
                        Text("🔒 Zero-Knowledge Location E2EE")
                            .font(.system(.caption, design: .rounded))
                            .foregroundColor(.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                    }
                    
                    Spacer()
                    
                    Button {
                        isEditingProfile.toggle()
                    } label: {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .font(.title2)
                            .foregroundColor(.white)
                            .padding(12)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                            .shadow(radius: 4)
                    }
                }
                .padding()
                
                Spacer()
                
                // Bottom Glassmorphic Dashboard
                VStack(spacing: 16) {
                    // Profile info & status Row
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(userName)
                                .font(.headline)
                                .foregroundColor(.white)
                            
                            HStack {
                                Circle()
                                    .fill(locationManager.isTrackingActive ? Color.green : Color.red)
                                    .frame(width: 8, height: 8)
                                Text(locationManager.isTrackingActive ? "Active" : "Stopped")
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.8))
                            }
                        }
                        
                        Spacer()
                        
                        // Battery indicator
                        HStack(spacing: 4) {
                            let batteryVal = Int(UIDevice.current.batteryLevel * 100)
                            let isCharging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
                            
                            Text("\(batteryVal >= 0 ? batteryVal : 100)%")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.9))
                            
                            Text(isCharging ? "⚡" : "🔋")
                                .font(.caption)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.15))
                        .clipShape(Capsule())
                    }
                    .padding(.horizontal)
                    
                    // Coordinates Display
                    if let loc = locationManager.lastLocation {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("📍 Lat:")
                                    .foregroundColor(.white.opacity(0.7))
                                    .font(.system(.caption, design: .monospaced))
                                Text(String(format: "%.6f", loc.coordinate.latitude))
                                    .foregroundColor(.white)
                                    .font(.system(.caption, design: .monospaced))
                                    .bold()
                            }
                            HStack {
                                Text("📍 Lon:")
                                    .foregroundColor(.white.opacity(0.7))
                                    .font(.system(.caption, design: .monospaced))
                                Text(String(format: "%.6f", loc.coordinate.longitude))
                                    .foregroundColor(.white)
                                    .font(.system(.caption, design: .monospaced))
                                    .bold()
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.white.opacity(0.08))
                        .cornerRadius(12)
                        .padding(.horizontal)
                    }
                    
                    // Diagnostics & Tracking Toggle Button
                    HStack(spacing: 12) {
                        Button {
                            locationManager.toggleTracking()
                        } label: {
                            HStack {
                                Image(systemName: locationManager.isTrackingActive ? "stop.fill" : "play.fill")
                                Text(locationManager.isTrackingActive ? "Stop Tracking" : "Start Tracking")
                            }
                            .bold()
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(locationManager.isTrackingActive ? Color.red.opacity(0.8) : Color.blue.opacity(0.8))
                            .cornerRadius(14)
                            .shadow(radius: 4)
                        }
                        
                        Button {
                            locationManager.requestPermissions()
                        } label: {
                            Image(systemName: "location.badge.checkmark")
                                .bold()
                                .foregroundColor(.white)
                                .padding(.vertical, 14)
                                .padding(.horizontal, 18)
                                .background(Color.white.opacity(0.2))
                                .cornerRadius(14)
                                .shadow(radius: 4)
                        }
                    }
                    .padding(.horizontal)
                    
                    // Scrolling Mini Diagnostic Logs
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Diagnostic Logs")
                            .font(.caption2)
                            .bold()
                            .foregroundColor(.white.opacity(0.6))
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(locationManager.logs, id: \.self) { log in
                                    Text(log)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundColor(.green.opacity(0.9))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(height: 60)
                    }
                    .padding()
                    .background(Color.black.opacity(0.3))
                    .cornerRadius(12)
                    .padding([.horizontal, .bottom])
                }
                .background(.ultraThinMaterial)
                .cornerRadius(24)
                .padding()
                .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 10)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isEditingProfile) {
            ProfileSettingsView(userName: $userName, customFamilyKey: $customFamilyKey)
        }
    }
}

struct ProfileSettingsView: View {
    @Environment(\.presentationMode) var presentationMode
    @Binding var userName: String
    @Binding var customFamilyKey: String
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("User Configuration")) {
                    TextField("Enter Name", text: $userName)
                        .autocapitalization(.words)
                    
                    SecureField("Custom Key (Optional)", text: $customFamilyKey)
                }
                
                Section(header: Text("Zero-Knowledge Security")) {
                    Text("All physical GPS coordinate fields are encrypted client-side using industry-grade AES-CBC-256 before leaving your device.")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
            .navigationTitle("Device Profile")
            .navigationBarItems(trailing: Button("Save") {
                UserDefaults.standard.set(userName, forKey: "user_name")
                UserDefaults.standard.set(customFamilyKey, forKey: "custom_family_key")
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
