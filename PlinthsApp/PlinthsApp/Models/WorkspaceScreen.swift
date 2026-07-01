import Foundation

/// The active workspace surface. `.report` carries the memo to display.
enum WorkspaceScreen {
    case home
    case loading
    case report(MarketMemo, Date, String)   // memo, created date, reportKey
}
