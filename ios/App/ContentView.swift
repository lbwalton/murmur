// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it.
struct ContentView: View {
    var body: some View {
        Text("murmur")
            .font(.largeTitle.weight(.semibold))
            .foregroundStyle(Tokens.brand)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.ink)
    }
}

#Preview {
    ContentView()
}
