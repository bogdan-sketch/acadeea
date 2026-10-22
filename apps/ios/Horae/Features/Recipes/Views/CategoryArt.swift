import SwiftUI

/// The nine category drawings of the web recipe cards (`category-art.tsx`).
enum CategoryArtKind: String, CaseIterable {
    case cake, mono, macaron, cookie, tart, slice, croissant, bowl, cupcake
}

/// Faded category watermark for recipe tiles — a port of the web
/// `CategoryArt`. Each glyph is a 120×120 drawing built like the SVG mask:
/// `ink` elements paint, `cut` elements erase what is under them (layer lines,
/// chips, rims), so cut-outs show the tile through in every scheme. The
/// caller sets colour (the tint ink) and opacity. Decorative: hidden from
/// VoiceOver.
struct CategoryArt: View {
    let kind: CategoryArtKind

    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 120
            context.scaleBy(x: scale, y: scale)
            for element in CategoryArtGlyphs.elements(kind) {
                element.draw(in: &context)
            }
        }
        .compositingGroup()
        .accessibilityHidden(true)
    }
}

// MARK: - Elements

/// One mask element: a filled or stroked path that either paints ink or cuts.
struct ArtElement {
    enum Paint { case ink, cut }
    var path: Path
    var paint: Paint
    /// nil = fill; otherwise a stroke of this style.
    var stroke: StrokeStyle?

    func draw(in context: inout GraphicsContext) {
        context.blendMode = paint == .cut ? .destinationOut : .normal
        let shading = GraphicsContext.Shading.foreground
        if let stroke {
            context.stroke(path, with: shading, style: stroke)
        } else {
            context.fill(path, with: shading)
        }
    }

    static func fill(_ path: Path) -> ArtElement { ArtElement(path: path, paint: .ink) }
    static func hole(_ path: Path) -> ArtElement { ArtElement(path: path, paint: .cut) }
    /// The web `CUT` preset: black stroke, round caps, width 3 by default.
    static func cut(_ path: Path, width: CGFloat = 3) -> ArtElement {
        ArtElement(path: path, paint: .cut, stroke: StrokeStyle(lineWidth: width, lineCap: .round))
    }
    static func line(_ path: Path, width: CGFloat, cap: CGLineCap = .butt) -> ArtElement {
        ArtElement(path: path, paint: .ink, stroke: StrokeStyle(lineWidth: width, lineCap: cap))
    }
}

// MARK: - Glyphs

enum CategoryArtGlyphs {
    // Shorthands mirroring the SVG primitives.
    private static func d(_ s: String) -> Path { SVGPath.parse(s) }
    private static func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
    }
    private static func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
    }
    private static func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r)
    }
    /// Berry: black ring then white core.
    private static func berry(_ cx: CGFloat, _ cy: CGFloat, _ outer: CGFloat, _ inner: CGFloat) -> [ArtElement] {
        [.hole(circle(cx, cy, outer)), .fill(circle(cx, cy, inner))]
    }
    /// SVG `rotate(deg cx cy)`.
    private static func rotated(_ elements: [ArtElement], _ degrees: CGFloat, _ cx: CGFloat, _ cy: CGFloat) -> [ArtElement] {
        let t = CGAffineTransform(translationX: cx, y: cy)
            .rotated(by: degrees * .pi / 180)
            .translatedBy(x: -cx, y: -cy)
        return elements.map { var e = $0; e.path = e.path.applying(t); return e }
    }

    static func elements(_ kind: CategoryArtKind) -> [ArtElement] {
        switch kind {
        case .cake: cake
        case .mono: mono
        case .macaron: macaron
        case .cookie: cookie
        case .tart: tart
        case .slice: slice
        case .croissant: croissant
        case .bowl: bowl
        case .cupcake: cupcake
        }
    }

    // Wedge of layered cake with a berry on top.
    private static let cake: [ArtElement] = [
        .fill(d("M16 72 L78 38 L108 50 L108 92 L16 102 Z")),
        .cut(d("M16 72 L108 50")),
        .cut(d("M16 82 L108 64 M16 92 L108 78"), width: 4),
    ] + berry(80, 40, 13, 10) + [
        .fill(d("M81 30 C80 20 72 16 66 18 C70 22 74 27 81 30 Z")),
    ]

    // Round entremet with mirror glaze drips and a raspberry.
    private static let mono: [ArtElement] = [
        .fill(ellipse(60, 100, 50, 9)),
        .cut(ellipse(60, 94, 44, 9), width: 4),
        .fill(d("M22 46 L22 90 C22 99 98 99 98 90 L98 46 Z")),
        .fill(ellipse(60, 46, 38, 12)),
        .cut(d("M22 60 C28 60 28 72 33 72 C38 72 38 60 46 60 C54 60 54 68 60 68 C66 68 66 60 74 60 C82 60 82 76 88 76 C94 76 96 64 98 60")),
        .cut(ellipse(60, 46, 28, 7), width: 2.5),
    ] + berry(60, 38, 11, 8)

    // Macaron, slightly tilted: shells, ruffled feet, filling.
    private static let macaron: [ArtElement] = {
        let xs: [CGFloat] = [20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90, 97]
        var e: [ArtElement] = [
            .fill(d("M16 50 C16 22 104 22 104 50 Z")),
            .cut(d("M34 40 C42 33 54 31 64 31")),
        ]
        e += xs.map { .fill(circle($0 + 1.5, 52.5, 3.6)) }
        e.append(.fill(rect(20, 58, 80, 13, r: 6.5)))
        e += xs.map { .fill(circle($0 + 1.5, 76.5, 3.6)) }
        e.append(.fill(d("M16 79 L104 79 C104 98 16 98 16 79 Z")))
        return rotated(e, -14, 60, 60)
    }()

    // Chocolate-chip cookie with a bite out of it.
    private static let cookie: [ArtElement] = {
        var e: [ArtElement] = [
            .fill(circle(58, 62, 46)),
            .hole(circle(102, 28, 16)),
            .hole(circle(90, 16, 11)),
            .hole(circle(108, 46, 11)),
        ]
        let chips = [
            "M34 42 l9 -3 l3 8 l-8 4 z", "M60 50 l8 1 l-1 8 l-8 -1 z", "M30 70 l8 -2 l2 7 l-8 2 z",
            "M52 82 l9 1 l-2 8 l-8 -2 z", "M76 70 l7 -3 l3 7 l-7 3 z", "M50 26 l6 2 l-2 6 l-6 -2 z",
            "M82 92 l6 -1 l1 6 l-6 1 z",
        ]
        for chip in chips {
            let p = d(chip)
            e.append(.hole(p))
            e.append(ArtElement(path: p, paint: .cut, stroke: StrokeStyle(lineWidth: 2, lineJoin: .round)))
        }
        return e
    }()

    // Fluted tart shell with berries.
    private static let tart: [ArtElement] = {
        var e: [ArtElement] = [
            .fill(d("M12 54 L20 82 C26 94 94 94 100 82 L108 54 Z")),
            .fill(ellipse(60, 54, 48, 15)),
            .cut(ellipse(60, 54, 39, 10)),
            .cut(d("M22 66 L26 84 M33 70 L36 88 M45 72 L47 90 M60 73 L60 91 M75 72 L73 90 M87 70 L84 88 M98 66 L94 84"), width: 2.5),
        ]
        for (cx, cy) in [(44.0, 50.0), (58, 46), (72, 50), (52, 58), (67, 58)] {
            e += berry(cx, cy - 6, 8.5, 6)
        }
        return e
    }()

    // Square entremet slice on a plate.
    private static let slice: [ArtElement] = [
        .fill(ellipse(60, 94, 52, 13)),
        .cut(ellipse(60, 92, 40, 8), width: 2.5),
        .fill(d("M28 48 L44 36 L94 36 L94 76 L78 90 L28 90 Z")),
        .cut(d("M28 48 L78 48 L94 36 M78 48 L78 90")),
        .cut(d("M28 62 L78 62 L94 50 M28 76 L78 76 L94 64"), width: 2.5),
    ] + berry(58, 34, 10, 7) + [
        .fill(d("M64 30 C70 20 80 22 82 24 C76 28 72 30 64 30 Z")),
    ]

    // Croissant: one crescent, laminated into five segments.
    private static let croissant: [ArtElement] = [
        .fill(d("M10 86 C10 52 34 24 60 24 C86 24 110 52 110 86 C102 74 92 70 84 72 C78 76 70 78 60 78 C50 78 42 76 36 72 C28 70 18 74 10 86 Z")),
        .cut(d("M26 42 C33 52 36 62 36 72 M44 29 C49 44 50 60 48 77 M76 29 C71 44 70 60 72 77 M94 42 C87 52 84 62 84 72"), width: 3.5),
    ]

    // Mixing bowl with a balloon whisk dipped in it.
    private static let bowl: [ArtElement] = rotated([
        .fill(rect(72, -8, 8, 34, r: 4)),
        .line(ellipse(76, 50, 15, 26), width: 3.5),
        .line(ellipse(76, 50, 8, 26), width: 3.5),
        .line(d("M76 24 L76 76"), width: 3.5),
    ], 32, 76, 46) + [
        .hole(d("M8 54 L112 54 L112 64 L8 64 Z")),
        .fill(d("M12 58 L108 58 C108 86 88 102 60 102 C32 102 12 86 12 58 Z")),
        .cut(d("M14 66 L106 66")),
        .cut(d("M30 80 C40 90 54 94 66 94"), width: 2.5),
        .fill(rect(44, 104, 32, 7, r: 3.5)),
    ]

    // Cupcake: pleated case, piped swirl, cherry.
    private static let cupcake: [ArtElement] = [
        .fill(d("M30 70 L90 70 L82 108 L38 108 Z")),
        .cut(d("M44 74 L48 104 M60 74 L60 104 M76 74 L72 104"), width: 2.5),
        .fill(d("M24 66 C18 52 32 44 40 46 C38 32 52 26 60 30 C62 18 80 18 82 32 C92 32 100 46 94 54 C102 58 98 68 92 68 Z")),
        .cut(d("M30 60 C44 66 72 66 90 58 M44 46 C54 52 70 52 82 44")),
    ] + berry(74, 20, 11, 8) + [
        .line(d("M76 12 C78 6 84 4 88 4"), width: 3, cap: .round),
    ]
}

// MARK: - SVG path data

/// Minimal SVG path-data parser for the glyphs above: M/L/C/Z, absolute and
/// relative, with implicit repeats.
enum SVGPath {
    static func parse(_ data: String) -> Path {
        var path = Path()
        var tokens: [String] = []
        var number = ""
        func flush() { if !number.isEmpty { tokens.append(number); number = "" } }
        for ch in data {
            if ch.isLetter { flush(); tokens.append(String(ch)) }
            else if ch == " " || ch == "," { flush() }
            else if ch == "-", !number.isEmpty { flush(); number = "-" }
            else { number.append(ch) }
        }
        flush()

        var i = 0
        var command: Character = "M"
        var current = CGPoint.zero
        var start = CGPoint.zero
        func next() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i]) ?? 0) }
        func point(relative: Bool) -> CGPoint {
            let x = next(), y = next()
            return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
        }
        while i < tokens.count {
            if let c = tokens[i].first, c.isLetter { command = c; i += 1 }
            let relative = command.isLowercase
            switch command.uppercased().first {
            case "M":
                current = point(relative: relative); start = current
                path.move(to: current)
                command = relative ? "l" : "L" // implicit lineto after moveto
            case "L":
                current = point(relative: relative)
                path.addLine(to: current)
            case "C":
                let c1 = point(relative: relative), c2 = point(relative: relative)
                let end = point(relative: relative)
                path.addCurve(to: end, control1: c1, control2: c2)
                current = end
            case "Z":
                path.closeSubpath(); current = start
            default:
                i += 1
            }
        }
        return path
    }
}

#Preview("Category art") {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))]) {
        ForEach(CategoryArtKind.allCases, id: \.self) { kind in
            VStack {
                CategoryArt(kind: kind)
                    .foregroundStyle(Color.hex(0xA8325C))
                    .frame(width: 96, height: 96)
                Text(kind.rawValue).font(.caption)
            }
        }
    }
    .padding()
}
