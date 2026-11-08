// SPDX-License-Identifier: GPL-3.0-only
// The Session screen (ios/prd.json IOS-009): whether a session is running,
// how long it keeps listening after your last take, and End session.
import SwiftUI

struct SessionScreen: View {
    @Bindable var session: Session
    @State private var refused = false

    var body: some View {
        List {
            Section {
                Text(SessionCopy.status(until: session.until))
                    .foregroundStyle(Tokens.text)
            } footer: {
                Text(SessionCopy.explain)
            }
            .listRowBackground(Tokens.panel)
            Section {
                ForEach(Session.Length.allCases, id: \.self) { length in
                    Button {
                        session.choose(length)
                    } label: {
                        HStack {
                            Text(SessionCopy.name(length)).foregroundStyle(Tokens.text)
                            Spacer()
                            if session.length == length {
                                Image(systemName: "checkmark").foregroundStyle(Tokens.brand)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .accessibilityAddTraits(session.length == length ? .isSelected : [])
                }
            } header: {
                Text(SessionCopy.length)
            } footer: {
                Text(SessionCopy.lengthFooter)
            }
            .listRowBackground(Tokens.panel)
            Section {
                if session.isOn {
                    Button(SessionCopy.end) { session.end() }
                        .foregroundStyle(Tokens.brand)
                } else {
                    Button(SessionCopy.start) {
                        Task { refused = await !session.begin() }
                    }
                    .foregroundStyle(Tokens.brand)
                }
            } footer: {
                if refused, !session.isOn {
                    Text(SessionCopy.micOff).foregroundStyle(Tokens.red)
                } else if !session.isOn {
                    Text(SessionCopy.startFooter)
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .navigationTitle("Session")
    }
}

/// Opens the Session screen on the app's one session.
struct SessionRoute: View {
    var body: some View {
        if let session = Session.live() {
            SessionScreen(session: session)
        }
    }
}
