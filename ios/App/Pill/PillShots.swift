// SPDX-License-Identifier: GPL-3.0-only
// The pill's stages as images (ios/prd.json IOS-010), like desktop's ink
// shots: launched with --pill-shots (npm run ios:pill-shots), the app draws
// every stage of every style as the keyboard shows it, writes the PNGs,
// prints where, and exits.
import UIKit

enum PillShots {
    /// Each shot: a name, and the frame drawn. Processing and inserted are
    /// caught at moments that show their motion: wet with the first sheen,
    /// dry between sheens, the softer sheen, and sinking, then flat.
    static let shots: [(name: String, frame: PillFrame)] = PillStyle.allCases.flatMap { style -> [(String, PillFrame)] in
        let moments: [(String, PillStage, TimeInterval, Bool)] = [
            ("idle", .idle, 0, false),
            ("recording", .recording, 0.5, false),
            ("recording-still", .recording, 0, true),
            ("processing-sheen", .processing, 0.3, false),
            ("processing-dry", .processing, 1.5, false),
            ("processing-again", .processing, 2.35, false),
            ("processing-still", .processing, 0, true),
            ("inserted-sinking", .inserted, 0.12, false),
            ("inserted", .inserted, 1, false),
            ("no-speech", .noSpeech, 0, false),
            ("error", .error, 0, false)
        ]
        return moments.map { name, stage, time, still in
            ("\(style.rawValue)-\(name)", PillFrame(style: style, stage: stage, levels: DemoVoice.levels, time: time, still: still))
        }
    }

    /// The pill as the keyboard shows it: the capsule on the pad's ink,
    /// with the waveform inside.
    static func image(_ frame: PillFrame, size: CGSize = CGSize(width: 236, height: 56), scale: CGFloat = 3) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            let context = renderer.cgContext
            context.setFillColor(UIColor(Tokens.ink).cgColor)
            context.fill(CGRect(origin: .zero, size: size))
            let capsule = CGRect(origin: .zero, size: size)
            context.setFillColor(UIColor(Tokens.panelLift).cgColor)
            context.addPath(CGPath(roundedRect: capsule, cornerWidth: size.height / 2, cornerHeight: size.height / 2, transform: nil))
            context.fillPath()
            Pill.paint(frame, in: capsule.insetBy(dx: 28, dy: 14), context: context)
        }
    }

    static func runAndExit() -> Never {
        let folder = FileManager.default.temporaryDirectory.appending(path: "pill-shots", directoryHint: .isDirectory)
        try? FileManager.default.removeItem(at: folder)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            for shot in shots {
                guard let png = image(shot.frame).pngData() else { throw CocoaError(.fileWriteUnknown) }
                try png.write(to: folder.appending(path: "\(shot.name).png"))
            }
            FileHandle.standardOutput.write(Data("PILL_SHOTS \(folder.path)\n".utf8))
            exit(0)
        } catch {
            FileHandle.standardOutput.write(Data("PILL_SHOTS_FAILED \(error)\n".utf8))
            exit(1)
        }
    }
}
