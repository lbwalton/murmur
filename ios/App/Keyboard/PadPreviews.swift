// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard's pad in its states (ios/prd.json IOS-008, IOS-023),
// at the keyboard's own height, so its layout can be read here and in the
// render tests without a keyboard on screen.
#if DEBUG
import SwiftUI
import UIKit

#Preview("Pad, at rest") { PadPreview(.rest) }
#Preview("Pad, a note landed") { PadPreview(.noted) }
#Preview("Pad, Insert last") { PadPreview(.insertLast) }
#Preview("Pad, largest text") { PadPreview(.noted).dynamicTypeSize(.accessibility5) }

struct PadPreview: UIViewRepresentable {
    enum Moment: CaseIterable { case rest, noted, insertLast }

    static let height = PadView.height

    let moment: Moment

    init(_ moment: Moment) { self.moment = moment }

    func makeUIView(context: Context) -> PadView {
        let pad = PadView()
        Self.stage(pad, moment)
        return pad
    }

    func updateUIView(_ pad: PadView, context: Context) {}

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: PadView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 390, height: Self.height)
    }

    static func stage(_ pad: PadView, _ moment: Moment) {
        switch moment {
        case .rest:
            pad.setStage(.idle)
            pad.status.text = Pad.idleHint
        case .noted:
            pad.setStage(.inserted)
            pad.status.text = Pad.noted("inbox")
            pad.offer(.openNote)
        case .insertLast:
            pad.setStage(.idle)
            pad.status.text = Pad.idleHint
            pad.offer(.insertLast)
        }
    }
}
#endif
