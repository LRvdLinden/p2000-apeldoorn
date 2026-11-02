import WidgetKit
import SwiftUI

@main
struct P2000WidgetBundle: WidgetBundle {
    var body: some Widget {
        LatestMeldingWidget()
        TodayWidget()
        #if !os(watchOS)
        MeldingenListWidget()
        #endif
    }
}

struct LatestMeldingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "LatestMelding", intent: MeldingWidgetIntent.self, provider: MeldingProvider()) { entry in
            LatestMeldingView(entry: entry)
        }
        .configurationDisplayName("Laatste melding")
        .description("De nieuwste P2000-melding in gem. Apeldoorn.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(watchOS)
        return [.accessoryRectangular, .accessoryInline]
        #elseif os(macOS)
        return [.systemSmall, .systemMedium]
        #else
        return [.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline]
        #endif
    }
}

#if !os(watchOS)
struct MeldingenListWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MeldingenList", intent: MeldingWidgetIntent.self, provider: MeldingProvider()) { entry in
            MeldingenListView(entry: entry)
        }
        .configurationDisplayName("Meldingen")
        .description("De laatste meldingen als lijst, tik om te openen.")
        .supportedFamilies([.systemMedium, .systemLarge, .systemExtraLarge])
    }
}
#endif

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Vandaag", provider: TodayProvider()) { entry in
            TodayView(entry: entry)
        }
        .configurationDisplayName("Vandaag")
        .description("Het aantal meldingen van vandaag per hulpdienst.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(watchOS)
        return [.accessoryCircular, .accessoryCorner, .accessoryInline]
        #elseif os(macOS)
        return [.systemSmall]
        #else
        return [.systemSmall, .accessoryCircular, .accessoryInline]
        #endif
    }
}
