#!/usr/bin/env python3
"""
The SelfImpulse mark — one geometry, two renderers.

WHY A SCRIPT AND NOT AN EXPORTED FILE. An app icon has to exist as a vector (the web
favicon, the in-app mark) and as a raster set (the desktop shell: 16px tray through 1024px
store art). Exporting one from the other by hand is how the two drift, and a 32px icon that
disagrees with the 512px one is the kind of thing nobody notices until it is on a taskbar.
So the geometry is declared ONCE below, at the top, in a 48-unit square; the SVG writer and
the PIL rasteriser both read it.

THE MARK. An impulse: a line that rises sharply, overshoots, and then decays into two
smaller beats that continue past it. The two beats are the part that makes it this product's
mark rather than a generic waveform — the spike is what the agent does, the trailing beats
are what is left of it afterwards. Hence the tagline.

Colours are the same two the interface uses (brass and verdigris) on the same graphite
ground, so the icon is in the product's palette rather than beside it.
"""

# ── THE GEOMETRY, in a 48×48 unit square. Everything below reads from here. ──────────────
FIELD = dict(x=1.5, y=1.5, w=45.0, h=45.0, r=11.0)
FIELD_FILL = "#0F1113"
FIELD_EDGE = "#262A31"
FIELD_EDGE_W = 1.5

# The impulse: one asymmetric spike. Flat lead-in, sharp rise, deeper fall, a step back up.
IMPULSE = [
    (8.0, 31.5), (14.5, 31.5), (19.5, 13.5), (25.5, 35.5), (30.5, 24.5),
]
IMPULSE_W = 4.4
IMPULSE_CAP = "round"

# What remains: two beats, decaying, on the same baseline as the spike's shoulder.
BEATS = [((35.5, 24.5), 2.5), ((41.5, 24.5), 1.4)]

# ── THE SMALL-SIZE VARIANT, and why there is one. ─────────────────────────────
# Rendered at 32px and looked at, the full mark goes muddy: the lead-in tail thins to
# nothing, the spike loses its peak, and the two beats merge into one smudge. An icon that
# only reads at 512px is decoration, not an icon — so below 48px the art gets SIMPLER on
# purpose: the tail is dropped, the spike is taller, the stroke is much heavier, the dim
# second beat goes, and the frame's hairline edge goes with it (at 16px it is a grey fog
# over the corners). This is what real icon sets do at tray sizes, and it is a decision
# rather than a downscale.
SMALL_BELOW = 48
IMPULSE_SMALL = [(11.0, 29.5), (17.5, 29.5), (22.5, 9.5), (28.5, 38.5), (34.0, 24.0)]
IMPULSE_SMALL_W = 6.6
BEATS_SMALL = [((39.5, 24.0), 3.0)]

BRASS = "#C9A45C"
VERDIGRIS = "#3F7D6E"
GRAPHITE = FIELD_FILL


def svg() -> str:
    poly = " ".join(f"{'M' if i == 0 else 'L'} {x:g} {y:g}" for i, (x, y) in enumerate(IMPULSE))
    beats = "\n  ".join(
        f'<circle cx="{x:g}" cy="{y:g}" r="{r:g}" fill="{VERDIGRIS if i else BRASS}"'
        + (f' fill-opacity="0.72"' if i else "")
        + "/>"
        for i, ((x, y), r) in enumerate(BEATS)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="SelfImpulse">
  <title>SelfImpulse</title>
  <rect x="{FIELD['x']:g}" y="{FIELD['y']:g}" width="{FIELD['w']:g}" height="{FIELD['h']:g}"
        rx="{FIELD['r']:g}" fill="{FIELD_FILL}" stroke="{FIELD_EDGE}" stroke-width="{FIELD_EDGE_W:g}"/>
  <path d="{poly}" fill="none" stroke="{BRASS}" stroke-width="{IMPULSE_W:g}"
        stroke-linecap="{IMPULSE_CAP}" stroke-linejoin="{IMPULSE_CAP}"/>
  {beats}
</svg>
"""


def render(px: int):
    """Rasterise, choosing the variant by size. Drawn at 4× and downsampled (PIL has no AA)."""
    from PIL import Image, ImageDraw

    simple = px < SMALL_BELOW
    impulse = IMPULSE_SMALL if simple else IMPULSE
    width = IMPULSE_SMALL_W if simple else IMPULSE_W
    beats = BEATS_SMALL if simple else BEATS

    S = px * 4
    k = S / 48.0  # units → pixels
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle(
        [FIELD["x"] * k, FIELD["y"] * k, (FIELD["x"] + FIELD["w"]) * k, (FIELD["y"] + FIELD["h"]) * k],
        radius=FIELD["r"] * k,
        fill=FIELD_FILL,
        outline=None if simple else FIELD_EDGE,
        width=1 if simple else max(1, round(FIELD_EDGE_W * k)),
    )

    pts = [(x * k, y * k) for x, y in impulse]
    d.line(pts, fill=BRASS, width=max(1, round(width * k)), joint="curve")
    # PIL's line() draws butt caps; the SVG asks for round ones. A dot at each end is the
    # honest way to match it without a second renderer.
    r_cap = width * k / 2
    for (cx, cy) in (pts[0], pts[-1]):
        d.ellipse([cx - r_cap, cy - r_cap, cx + r_cap, cy + r_cap], fill=BRASS)

    for i, ((x, y), r) in enumerate(beats):
        cx, cy, rr = x * k, y * k, r * k
        col = VERDIGRIS if (i and len(beats) > 1) else BRASS
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)

    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    brand = root / "public" / "brand"
    icons = root / "src-tauri" / "icons"
    brand.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)

    (brand / "si-mark.svg").write_text(svg())
    (brand / "si-icon.svg").write_text(svg())
    (root / "public" / "favicon.svg").write_text(svg())

    # The desktop set. 1024 is the source every store and every future re-export reads.
    for px, name in [
        (1024, "icon.png"), (512, "512x512.png"), (256, "128x128@2x.png"),
        (128, "128x128.png"), (64, "64x64.png"), (32, "32x32.png"), (16, "16x16.png"),
    ]:
        render(px).save(icons / name)
    render(1024).save(brand / "si-icon-1024.png")
    render(128).save(brand / "si-mark-128.png")

    # Windows: PIL writes a multi-resolution .ico from the frames it is given.
    render(256).save(
        icons / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # macOS .icns is not writable without a toolchain this sandbox does not have. The
    # honest output is the source PNG plus the instruction, not a fabricated icon.icns.
    print("wrote the mark, the raster set and the .ico")
    print("NOTE: src-tauri/icons/icon.icns still holds the PREVIOUS icon. Regenerate it with")
    print("      `npm run tauri icon src-tauri/icons/icon.png`, which needs the Rust toolchain.")


if __name__ == "__main__":
    main()
