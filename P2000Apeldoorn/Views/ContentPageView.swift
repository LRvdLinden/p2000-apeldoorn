import SwiftUI
import WebKit

/// Privacy statement, terms of use and disclaimer – served by the app's own API (worker/content).
struct ContentPageView: View {
    let name: String
    let title: String

    @State private var page: ContentPage?
    @State private var failed = false
    @State private var zoek = ""

    /// The help page is a list of questions (every <h2> with the text under it): only the questions that hold the search text.
    private func gefilterd(_ html: String) -> String {
        let q = zoek.trimmingCharacters(in: .whitespaces).lowercased()
        guard name == "hulp", !q.isEmpty else { return html }
        let delen = html.components(separatedBy: "<h2")
        let vragen = delen.dropFirst().filter { $0.replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression).lowercased().contains(q) }
        return vragen.isEmpty ? "<p>" + L("Geen vraag gevonden. Probeer een ander woord.") + "</p>" : vragen.map { "<h2" + $0 }.joined()
    }

    var body: some View {
        Group {
            if let page {
                if name == "hulp" {
                    HTMLView(html: gefilterd(page.content ?? ""), footer: footer(for: page))
                        .searchable(text: $zoek, prompt: L("Zoek in de vragen"))
                } else {
                    HTMLView(html: page.content ?? "", footer: footer(for: page))
                }
            } else if failed {
                ContentUnavailableView(L("Kon de tekst niet laden"), systemImage: "wifi.exclamationmark",
                                       description: Text(L("Controleer je internetverbinding en probeer het opnieuw.")))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(title)
        .task {
            do {
                page = try await P2000API.shared.contentPage(name)
                if page == nil { failed = true }
            } catch {
                failed = true
            }
        }
    }

    private func footer(for page: ContentPage) -> String {
        var parts: [String] = []
        if let v = page.version, !v.isEmpty { parts.append(Lf("Versie: %@", v)) }
        if let s = page.sourceName, !s.isEmpty { parts.append(s) }
        return parts.joined(separator: " · ")
    }
}

struct ChangelogView: View {
    @State private var entries: [ChangelogEntry] = []
    @State private var loading = true

    var body: some View {
        List {
            Section {
                HStack {
                    Text(L("Deze app"))
                    Spacer()
                    Text(Lf("Versie %@ (%@)", Config.version, Config.build)).foregroundStyle(.secondary)
                }
            }
            if loading {
                ProgressView().frame(maxWidth: .infinity)
            }
            ForEach(entries) { entry in
                Section {
                    Text(Self.plainText(entry.content ?? ""))
                        .font(AppFont.body(16, .light, relativeTo: .callout))
                } header: {
                    HStack {
                        Text(entry.title ?? L("Update"))
                        Spacer()
                        if let v = entry.version { Text("v\(v)") }
                    }
                } footer: {
                    if let raw = entry.releaseDate, let date = Fmt.parseISO(raw) {
                        Text(date.formatted(date: .long, time: .omitted))
                    }
                }
            }
        }
        .navigationTitle(L("Changelog"))
        .task {
            entries = (try? await P2000API.shared.changelog()) ?? []
            loading = false
        }
    }

    /// Very small HTML → text conversion for changelog bullets.
    static func plainText(_ html: String) -> String {
        var s = html
        for (tag, replacement) in [("<li>", "• "), ("</li>", "\n"), ("<br>", "\n"), ("<br/>", "\n"), ("</p>", "\n")] {
            s = s.replacingOccurrences(of: tag, with: replacement, options: .caseInsensitive)
        }
        s = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&amp;", with: "&")
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Renders the admin HTML with the system font, in light and dark mode.
struct HTMLView {
    let html: String
    var footer: String = ""

    var document: String {
        // Inline colours from the editor would be unreadable in dark mode.
        let cleaned = html.replacingOccurrences(of: #"\sstyle="[^"]*""#, with: "", options: .regularExpression)
        return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        :root { color-scheme: light dark; }
        body { font: -apple-system-body; font-family: -apple-system, system-ui; margin: 20px; line-height: 1.5;
               color: CanvasText; background: Canvas; max-width: 760px; }
        h1, h2, h3 { line-height: 1.25; }
        a { color: #DC2626; }
        .footer { margin-top: 32px; font-size: 13px; opacity: .6; }
        </style></head><body>\(cleaned)<p class="footer">\(footer)</p></body></html>
        """
    }
}

#if os(macOS)
extension HTMLView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.setValue(false, forKey: "drawsBackground")
        return view
    }
    func updateNSView(_ view: WKWebView, context: Context) {
        view.loadHTMLString(document, baseURL: Config.website)
    }
}
#else
extension HTMLView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.isOpaque = false
        view.backgroundColor = .clear
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        view.loadHTMLString(document, baseURL: Config.website)
    }
}
#endif
