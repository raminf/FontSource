import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("FontSource")
                .font(.system(size: 24, weight: .semibold))

            Text("This macOS host app installs and runs the Safari web extension bundle for FontSource.")
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Label("Open Safari Settings > Extensions to enable FontSource.", systemImage: "safari")
                Label("Use the toolbar button on any page to scan fonts and inspect their sources.", systemImage: "textformat")
            }
            .font(.system(size: 13))
        }
        .padding(24)
        .frame(minWidth: 420, minHeight: 220)
    }
}

#Preview {
    ContentView()
}
