// SPDX-License-Identifier: GPL-3.0-only
// The take screen's words, in one place: plain, sentence case, and for
// every failure what happened and what to do (ios/prd.json
// conventions.design). The reasons follow desktop's waiting list.
import Foundation

enum TakeCopy {
    /// Why a take is waiting, as a sentence.
    static func reason(_ failure: TakeFailure?) -> String {
        guard let failure else { return "murmur lost the reason for this one." }
        switch failure.kind {
        case "auth" where failure == .noKey: return "No API key is saved for your provider."
        case "auth": return "Your provider did not accept the key."
        case "network": return "murmur could not reach your provider."
        case "timeout": return "Your provider did not answer in time."
        case "server": return "Your provider had a problem on its end."
        case "badrequest": return "Your provider refused the audio or the model name."
        case "nospeech": return "No speech was heard in it."
        default: return "Something went wrong."
        }
    }

    /// What to do about it, after the reason.
    static func remedy(_ failure: TakeFailure) -> String {
        switch failure.kind {
        case "auth": return "Check Provider and key, then retry it below."
        case "badrequest": return "Check the model in Provider and key, then retry it below."
        default: return "It is saved below, so you can retry it."
        }
    }

    static func heardNothing(sent: Bool) -> String {
        sent
            ? "Your provider heard only silence, so murmur kept nothing."
            : "murmur heard no speech, so it sent nothing. Speak a little closer, then try again."
    }

    static let micOff = "Turn on Microphone for murmur in Settings, then try again."
    static let micFailed = "The microphone did not start. If another app is using it, close that app, then try again."
    static let lostAudio = "murmur could not save the audio either, so this take is gone."
    static let waitingIntro = "Recorded but not transcribed. The audio stays on this iPhone until you retry or discard it."

    /// What a retry says when it is done, as desktop's waiting list does.
    static func retried(delivered: Int, failed: Int) -> String {
        switch (delivered, failed) {
        case (0, _): "Still could not transcribe. The reason is updated below; the audio stays until you retry or discard it."
        case (1, 0): "Done: the words are above and on your clipboard."
        case (_, 0): "Done: \(delivered) takes. Their words are above and on your clipboard."
        default: "\(delivered) transcribed and on your clipboard, \(failed) still waiting."
        }
    }

    /// When and how long, for a waiting take's row.
    static func when(_ take: WaitingTake, now: Date = .now) -> String {
        let time = take.savedAt.formatted(date: .omitted, time: .shortened)
        let day = Calendar.current.isDate(take.savedAt, inSameDayAs: now) ? "Today" : take.savedAt.formatted(.dateTime.month(.abbreviated).day())
        return "\(day) \(time), \(length(take.audioMs))"
    }

    static func length(_ ms: Int) -> String {
        let seconds = max(1, Int((Double(ms) / 1000).rounded()))
        return seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
    }
}
