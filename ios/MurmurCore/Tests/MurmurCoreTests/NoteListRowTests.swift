// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// The iPhone's tasks and ideas lists (IOS-023): desktop's list items, with
/// the lead lines that introduce a run kept as their own rows, so "I need
/// to buy:" stays above apples and rice instead of disappearing.
@Suite struct NoteListRowTests {
    @Test func aLeadLineStaysAboveTheItemsUnderIt() {
        let text = "- I need to buy:\n  - [ ] apples ([10:32](inbox/2026-09-18.md))\n  - [x] rice\n- Maybe a garden. ([09:00](inbox/2026-09-17.md))\n"
        #expect(Todo.listRows(text) == [
            ListRow(text: "I need to buy:", done: false, checkbox: false, lead: true, nested: false),
            ListRow(text: "apples", done: false, checkbox: true, lead: false, nested: true),
            ListRow(text: "rice", done: true, checkbox: true, lead: false, nested: true),
            ListRow(text: "Maybe a garden.", done: false, checkbox: false, lead: false, nested: false),
        ])
    }

    /// Leave the lead rows out and the rows are desktop's list items, on
    /// every file desktop answered.
    @Test func withoutLeadsTheRowsAreDesktopsItems() throws {
        let file = try #require(NotesVectors.file)
        for case_ in file.files {
            let rows = Todo.listRows(case_.text).filter { !$0.lead }
            let items = Todo.listItems(case_.text)
            #expect(rows.map(\.text) == items.map(\.text))
            #expect(rows.map(\.done) == items.map(\.done))
            #expect(rows.map(\.checkbox) == items.map(\.checkbox))
        }
    }
}

/// A reply nested deeper than any sort answer is read as no JSON at all,
/// instead of running the parser out of stack.
@Suite struct JSValueDepthTests {
    @Test func aReplyNestedTooDeepIsNotJSON() {
        let deep = String(repeating: "[", count: 600) + String(repeating: "]", count: 600)
        #expect(JSValue.parse(deep) == nil)
        let fine = String(repeating: "[", count: 50) + String(repeating: "]", count: 50)
        #expect(JSValue.parse(fine) != nil)
    }
}
