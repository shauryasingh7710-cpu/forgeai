#!/usr/bin/env python3
"""Generate docs/MarketPulse_Round1.pptx — Round 1 pitch deck.

Slide structure follows the judging criteria exactly:
  Slide 1 Problem Statement · Slide 2 Existing Challenges · Slide 3 Proposed Solution
  Slide 4 PRISM Usage · Slide 5 System Workflow · Slide 6 Impact & Future Scope
(+ a cover slide in front)
"""
import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

# ---------------------------------------------------------------- theme ----
BG = RGBColor(0x0B, 0x12, 0x20)      # dark navy
PANEL = RGBColor(0x13, 0x1F, 0x35)   # card panel
PANEL2 = RGBColor(0x1A, 0x2A, 0x45)
ACCENT = RGBColor(0x22, 0xD3, 0xEE)  # cyan
GREEN = RGBColor(0x34, 0xD3, 0x99)
RED = RGBColor(0xF8, 0x71, 0x71)
AMBER = RGBColor(0xFB, 0xBF, 0x24)
VIOLET = RGBColor(0xA7, 0x8B, 0xFA)
TEXT = RGBColor(0xE6, 0xEE, 0xF8)
MUT = RGBColor(0x94, 0xA3, 0xB8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

SW, SH = Inches(13.333), Inches(7.5)
FONT = "Calibri"

OUT = os.path.join("docs", "MarketPulse_Round1.pptx")


# --------------------------------------------------------------- helpers ---
def new_slide(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = BG
    return slide


def tx(slide, l, t, w, h, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    return tf


def para(tf, text, size=14, color=TEXT, bold=False, first=False,
         space_after=6, align=PP_ALIGN.LEFT, italic=False, font=FONT):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.space_after = Pt(space_after)
    r = p.add_run()
    r.text = text
    f = r.font
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
    f.name = font
    f.color.rgb = color
    return p


def bullets(tf, items, size=15, color=TEXT, space_after=10):
    """items: list of (text, highlight_words_prefix) — simple bullet rendering."""
    for i, item in enumerate(items):
        head, rest = item
        p = tf.paragraphs[0] if (i == 0 and not tf.paragraphs[0].runs) else tf.add_paragraph()
        p.space_after = Pt(space_after)
        r0 = p.add_run()
        r0.text = "•  "
        r0.font.size = Pt(size)
        r0.font.bold = True
        r0.font.name = FONT
        r0.font.color.rgb = ACCENT
        r1 = p.add_run()
        r1.text = head
        r1.font.size = Pt(size)
        r1.font.bold = True
        r1.font.name = FONT
        r1.font.color.rgb = color
        if rest:
            r2 = p.add_run()
            r2.text = rest
            r2.font.size = Pt(size)
            r2.font.name = FONT
            r2.font.color.rgb = color


def card(slide, l, t, w, h, fill=PANEL, line=None, radius=True):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    sp = slide.shapes.add_shape(shape_type, l, t, w, h)
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line
        sp.line.width = Pt(1)
    sp.shadow.inherit = False
    if radius:
        try:
            sp.adjustments[0] = 0.08
        except Exception:
            pass
    return sp


def chip(slide, l, t, w, h, label, fill=PANEL2, color=ACCENT, size=11, bold=True):
    sp = card(slide, l, t, w, h, fill=fill)
    tf = sp.text_frame
    tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Emu(0)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = FONT
    r.font.color.rgb = color
    return sp


def title_bar(slide, num, title, subtitle=None):
    tf = tx(slide, Inches(0.55), Inches(0.32), Inches(10.5), Inches(1.0))
    para(tf, f"SLIDE {num}", size=11, color=ACCENT, bold=True, first=True, space_after=2)
    para(tf, title, size=28, color=WHITE, bold=True, space_after=2)
    if subtitle:
        para(tf, subtitle, size=12, color=MUT, space_after=0)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.58), Inches(1.42),
                                 Inches(1.6), Pt(3))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()
    bar.shadow.inherit = False


def footer(slide, page):
    tf = tx(slide, Inches(0.55), Inches(7.05), Inches(9.0), Inches(0.35))
    para(tf, "MarketPulse · AI for Finance · Decision support — not investment advice",
         size=9, color=MUT, first=True)
    tf2 = tx(slide, Inches(12.3), Inches(7.05), Inches(0.6), Inches(0.35))
    para(tf2, str(page), size=10, color=MUT, first=True, align=PP_ALIGN.RIGHT)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


# ---------------------------------------------------------------- deck -----
def cover(prs):
    s = new_slide(prs)
    # accent band
    band = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(0.12))
    band.fill.solid()
    band.fill.fore_color.rgb = ACCENT
    band.line.fill.background()
    band.shadow.inherit = False

    tf = tx(s, Inches(0.9), Inches(1.9), Inches(11.5), Inches(2.6))
    para(tf, "MARKETPULSE", size=48, color=WHITE, bold=True, first=True, space_after=4)
    para(tf, "AI-Powered Market Sentiment & Financial-Literacy Platform",
         size=20, color=ACCENT, bold=True, space_after=6)
    para(tf, "Indian markets (NSE/BSE) with global context — one dashboard that turns "
             "scattered market signals into a clear, explained Bullish / Bearish / Uncertain view.",
         size=14, color=MUT, space_after=0)

    chip(s, Inches(0.9), Inches(4.45), Inches(2.2), Inches(0.42), "AI for Finance")
    chip(s, Inches(3.25), Inches(4.45), Inches(2.6), Inches(0.42), "PRISM-instrumented", color=VIOLET)
    chip(s, Inches(6.0), Inches(4.45), Inches(3.1), Inches(0.42), "Decision support, not advice", color=AMBER)

    tf2 = tx(s, Inches(0.9), Inches(6.35), Inches(11.0), Inches(0.5))
    para(tf2, "Round 1 · Pitch Deck", size=12, color=MUT, first=True)
    notes(s, "Open with the hook: over 1.9 crore new demat accounts since 2020 — mostly beginners "
             "deciding on tips. The data they need already exists; the understanding doesn't. "
             "MarketPulse brings the signals together, explains them in plain language, and — "
             "unlike any generic chatbot — is instrumented with PRISM so every AI explanation "
             "is monitored, evaluated and improved.")


def slide_problem(prs):
    s = new_slide(prs)
    title_bar(s, 1, "Problem Statement", "What real-world problem are we trying to solve?")

    tf = tx(s, Inches(0.55), Inches(1.75), Inches(7.1), Inches(4.6))
    bullets(tf, [
        ("Beginners decide on incomplete info, ", "social-media tips & emotional reactions to news"),
        ("Key signals — volume, volatility, global trends, news — are public but ", "scattered across platforms"),
        ("Without financial knowledge or time, ", "these signals cannot be interpreted together"),
        ("Result: ", "panic buying, tip-chasing and avoidable losses"),
        ("New risk: generic AI chatbots ", "hallucinate numbers and cannot be verified"),
    ], size=15)

    # right visual: scattered signals -> confusion
    x0, y0 = Inches(8.1), Inches(1.85)
    labels = [("Volume", GREEN), ("Volatility (VIX)", AMBER),
              ("Global trends", ACCENT), ("News flow", VIOLET)]
    for i, (lab, col) in enumerate(labels):
        chip(s, x0, y0 + Inches(0.62) * i, Inches(2.0), Inches(0.45), lab,
             fill=PANEL, color=col, size=11)
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x0 + Inches(2.1),
                                y0 + Inches(0.62) * i + Inches(0.06), Inches(0.5), Inches(0.3))
        ar.fill.solid(); ar.fill.fore_color.rgb = MUT; ar.line.fill.background(); ar.shadow.inherit = False
    q = s.shapes.add_shape(MSO_SHAPE.OVAL, x0 + Inches(2.75), y0 + Inches(0.75),
                           Inches(1.35), Inches(1.35))
    q.fill.solid(); q.fill.fore_color.rgb = PANEL2; q.line.color.rgb = RED; q.line.width = Pt(1.5)
    q.shadow.inherit = False
    qtf = q.text_frame; qtf.vertical_anchor = MSO_ANCHOR.MIDDLE
    qp = qtf.paragraphs[0]; qp.alignment = PP_ALIGN.CENTER
    qr = qp.add_run(); qr.text = "?"
    qr.font.size = Pt(40); qr.font.bold = True; qr.font.color.rgb = RED; qr.font.name = FONT
    tfq = tx(s, x0 + Inches(2.3), y0 + Inches(2.25), Inches(2.3), Inches(0.6))
    para(tfq, "Bullish or Bearish?", size=13, color=WHITE, bold=True, first=True, align=PP_ALIGN.CENTER)

    notes(s, "Frame the gap: the data exists, the understanding doesn't. Add the 2026 twist: "
             "beginners now also ask generic AI chatbots, which sound confident but hallucinate "
             "numbers and give no way to verify. Two problems: scattered signals, and "
             "untrustworthy AI explanations.")
    footer(s, 1)


def slide_challenges(prs):
    s = new_slide(prs)
    title_bar(s, 2, "Existing Challenges", "What are the limitations, risks, or gaps in current solutions?")

    tf = tx(s, Inches(0.55), Inches(1.75), Inches(6.7), Inches(4.6))
    bullets(tf, [
        ("Scattered tools: ", "broker apps, screeners and news feeds each show one slice — numbers without meaning"),
        ("Tip culture: ", "unverified, herd-driven, zero accountability"),
        ("Generic LLMs: ", "no live market data, no evidence, and they blur education with advice"),
        ("Black-box scores: ", "sentiment numbers with no visible reasoning"),
        ("No closed loop anywhere: ", "nobody checks whether AI explanations were actually correct — no monitoring, no failure detection, no validated improvement"),
    ], size=14, space_after=9)

    # right: 2x2 broken tools grid + banner
    gx, gy = Inches(7.6), Inches(1.8)
    gw, gh = Inches(2.45), Inches(1.25)
    items = [
        ("Broker apps", "one broker's view only", RED),
        ("Tip culture", "unverified forwards", RED),
        ("Generic LLMs", "stale, unverifiable", RED),
        ("Black-box scores", "no reasoning shown", RED),
    ]
    for i, (t1, t2, col) in enumerate(items):
        cx = gx + (gw + Inches(0.25)) * (i % 2)
        cy = gy + (gh + Inches(0.25)) * (i // 2)
        c = card(s, cx, cy, gw, gh, fill=PANEL)
        ctf = c.text_frame; ctf.vertical_anchor = MSO_ANCHOR.MIDDLE
        ctf.margin_left = Inches(0.15); ctf.margin_right = Inches(0.1)
        p1 = ctf.paragraphs[0]
        r = p1.add_run(); r.text = "✗ " + t1
        r.font.size = Pt(13); r.font.bold = True; r.font.name = FONT; r.font.color.rgb = WHITE
        p2 = ctf.add_paragraph()
        r2 = p2.add_run(); r2.text = t2
        r2.font.size = Pt(10.5); r2.font.name = FONT; r2.font.color.rgb = MUT
    b = card(s, gx, gy + 2 * (gh + Inches(0.25)) + Inches(0.15), 2 * gw + Inches(0.25), Inches(0.55),
             fill=PANEL2, line=AMBER)
    btf = b.text_frame; btf.vertical_anchor = MSO_ANCHOR.MIDDLE
    bp = btf.paragraphs[0]; bp.alignment = PP_ALIGN.CENTER
    br = bp.add_run(); br.text = "No system monitors the AI itself."
    br.font.size = Pt(14); br.font.bold = True; br.font.name = FONT; br.font.color.rgb = AMBER

    notes(s, "Land the last bullet hard — it sets up PRISM as the differentiator: every current "
             "solution, including AI ones, ships without a monitoring and evaluation loop.")
    footer(s, 2)


def slide_solution(prs):
    s = new_slide(prs)
    title_bar(s, 3, "Proposed Solution", "What solution are we proposing and how does it solve the problem?")

    tf = tx(s, Inches(0.55), Inches(1.75), Inches(7.1), Inches(4.7))
    bullets(tf, [
        ("MarketPulse: ", "AI decision-support dashboard for Indian markets (NSE/BSE) with global-market context"),
        ("20+ validated indicators ", "— 50/200-DMA trend, MACD, RSI, India VIX, market breadth, volume profile, 52-week structure, global cues (DXY, crude, gold, US yields), news sentiment — fused into one Bearish → Bullish score"),
        ("Zero black box: ", "every signal explained in plain English with its \u201cwhy\u201d"),
        ("Grounded AI: ", "the LLM may only explain computed signals — never invent data — behind an advice-safety guardrail"),
        ("Literacy layer: ", "\u201cWhat is this?\u201d explainers on every card, glossary, beginner mode"),
    ], size=14, space_after=9)

    # right: mini dashboard mock
    mx = Inches(8.05)
    panel = card(s, mx, Inches(1.8), Inches(4.7), Inches(4.55), fill=PANEL, line=PANEL2)
    tfa = tx(s, mx + Inches(0.25), Inches(2.0), Inches(4.2), Inches(0.5))
    para(tfa, "MarketPulse — today", size=12, color=MUT, first=True)
    # score chip
    sc = card(s, mx + Inches(0.25), Inches(2.45), Inches(1.8), Inches(1.15), fill=PANEL2, line=GREEN)
    sctf = sc.text_frame; sctf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = sctf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = "+62"
    r.font.size = Pt(28); r.font.bold = True; r.font.color.rgb = GREEN; r.font.name = FONT
    p2 = sctf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
    r2 = p2.add_run(); r2.text = "Optimistic"
    r2.font.size = Pt(11); r2.font.color.rgb = TEXT; r2.font.name = FONT
    # gauge
    g = s.shapes.add_shape(MSO_SHAPE.BLOCK_ARC, mx + Inches(2.3), Inches(2.3), Inches(2.1), Inches(2.1))
    g.fill.solid(); g.fill.fore_color.rgb = ACCENT; g.line.fill.background(); g.shadow.inherit = False
    tfg = tx(s, mx + Inches(2.3), Inches(3.35), Inches(2.1), Inches(0.5))
    para(tfg, "62", size=22, color=WHITE, bold=True, first=True, align=PP_ALIGN.CENTER)
    # signal rows
    rows = [("Trend", "+", GREEN), ("Volatility", "−", RED), ("News", "+", GREEN), ("Global cues", "−", RED)]
    for i, (lab, sign, col) in enumerate(rows):
        ry = Inches(3.75) + Inches(0.52) * i
        chip(s, mx + Inches(0.25), ry, Inches(2.6), Inches(0.4), lab, fill=PANEL2, color=TEXT, size=10.5)
        tf3 = tx(s, mx + Inches(3.0), ry + Inches(0.02), Inches(1.5), Inches(0.35))
        para(tf3, f"{sign} why: plain-English reason", size=9, color=col, first=True)

    notes(s, "Emphasize transparency as the design principle: every number the AI says can be "
             "traced to a visible signal on screen. The score is computed by rules — the AI "
             "explains it, it doesn't invent it.")
    footer(s, 3)


def scorecard_visual(s, x, y, w, h):
    card(s, x, y, w, h, fill=PANEL, line=PANEL2)
    tf = tx(s, x + Inches(0.25), y + Inches(0.15), w - Inches(0.5), Inches(0.75))
    para(tf, "PRISM Reliability Scorecard", size=13, color=WHITE, bold=True, first=True, space_after=1)
    para(tf, "illustrative monthly report", size=9, color=MUT, italic=True)
    # big score
    tf2 = tx(s, x + Inches(0.25), y + Inches(0.85), Inches(1.7), Inches(1.0))
    para(tf2, "78", size=34, color=GREEN, bold=True, first=True, space_after=0)
    para(tf2, "/100  (+6 MoM)", size=10, color=MUT)
    dims = [
        ("Task success & resolution", 25, 82, GREEN),
        ("Correctness & groundedness", 20, 79, GREEN),
        ("Guardrails & policy adherence", 20, 91, GREEN),
        ("User friction & satisfaction", 15, 74, AMBER),
        ("Stability & error-free execution", 10, 88, GREEN),
        ("Improvement velocity", 10, 61, AMBER),
    ]
    bar_x = x + Inches(2.05)
    bar_max = w - Inches(2.45)
    by = y + Inches(0.95)
    for name, wt, val, col in dims:
        tfd = tx(s, x + Inches(0.25), by - Inches(0.02), Inches(1.8), Inches(0.4))
        para(tfd, f"{name}", size=8.5, color=TEXT, first=True, space_after=0)
        para(tfd, f"weight {wt}%", size=7.5, color=MUT, space_after=0)
        track = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, bar_x, by + Inches(0.08),
                                   bar_max, Inches(0.14))
        track.fill.solid(); track.fill.fore_color.rgb = PANEL2
        track.line.fill.background(); track.shadow.inherit = False
        fillw = int(bar_max * val / 100)
        fillr = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, bar_x, by + Inches(0.08),
                                   Emu(fillw), Inches(0.14))
        fillr.fill.solid(); fillr.fill.fore_color.rgb = col
        fillr.line.fill.background(); fillr.shadow.inherit = False
        tfv = tx(s, bar_x + bar_max + Emu(0), by - Inches(0.03), Inches(0.4), Inches(0.3))
        para(tfv, str(val), size=9, color=col, bold=True, first=True)
        by += Inches(0.53)


def slide_prism(prs):
    s = new_slide(prs)
    title_bar(s, 4, "PRISM Usage",
              "How PRISM is used to monitor, evaluate, detect failures, and improve the AI system")

    tf = tx(s, Inches(0.55), Inches(1.75), Inches(7.2), Inches(4.9))
    bullets(tf, [
        ("Connect: ", "every AI explanation run is streamed to PRISM via the PRISM SDK / OpenTelemetry — user goal, signal snapshot, prompt, output and final score captured as one session"),
        ("Monitor & Evaluate 100% of runs: ", "custom evaluators — Groundedness (every number must match the signal payload) · Consistency (narrative zone = computed zone) · Advice-safety guardrail (zero buy/sell language) · Completeness (cites top drivers)"),
        ("Detect failures: ", "PRISM clusters recurring failures (contradicts a VIX spike, hallucinated metric, stale cache), classifies root causes, flags low-confidence runs for human review"),
        ("Improve: ", "failures → backlog → fix (prompt diff / lexicon update) → human approval gate → re-tested with the same scenarios → validated on the six-dimension scorecard"),
        ("Pre-launch: ", "PRISM Synthetic Scenarios stress-test crash days, contradictory signals and missing data"),
    ], size=13, space_after=8)

    scorecard_visual(s, Inches(8.15), Inches(1.8), Inches(4.6), Inches(4.55))

    notes(s, "Key line (PRISM's own philosophy): 'A request can return 200 OK and still fail the "
             "user.' Our score means nothing unless an evaluator can verify it. Walk the loop: "
             "narrative said 'bullish momentum' while VIX jumped 15% → consistency evaluator failed "
             "it → root cause: prompt under-weighted volatility → prompt v2 → same scenario re-run → "
             "pass → reliability score +1.")
    footer(s, 4)


def slide_workflow(prs):
    s = new_slide(prs)
    title_bar(s, 5, "System Workflow",
              "Input → AI/RAG/Agent System → PRISM Monitoring & Evaluation → Failure Detection → Improvement")

    boxes = [
        ("Live Inputs", "indices · India VIX · volume\nglobal cues · news", ACCENT),
        ("AI System", "indicator engine → signal fusion\n→ grounded narrative", GREEN),
        ("PRISM Monitor\n& Evaluate", "traces · evaluators\nguardrail events", VIOLET),
        ("Failure Detection", "clustering · root cause\nlow-confidence flags", AMBER),
        ("Improvement", "human-gated fix → re-test\n→ validated delta", RED),
    ]
    n = len(boxes)
    gap = Inches(0.42)
    bw = Inches(2.25)
    bh = Inches(1.75)
    total = n * bw + (n - 1) * gap
    x = int((SW - total) / 2)
    y = Inches(2.35)
    for i, (t1, t2, col) in enumerate(boxes):
        bx = x + i * (bw + gap)
        c = card(s, Emu(bx), y, bw, bh, fill=PANEL, line=col)
        ctf = c.text_frame
        ctf.vertical_anchor = MSO_ANCHOR.MIDDLE
        ctf.margin_left = Inches(0.08); ctf.margin_right = Inches(0.08)
        p = ctf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
        r = p.add_run(); r.text = t1
        r.font.size = Pt(13.5); r.font.bold = True; r.font.name = FONT; r.font.color.rgb = col
        for line in t2.split("\n"):
            p2 = ctf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
            r2 = p2.add_run(); r2.text = line
            r2.font.size = Pt(9.5); r2.font.name = FONT; r2.font.color.rgb = TEXT
        if i < n - 1:
            ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW,
                                    Emu(bx + bw + Inches(0.04)), y + Inches(0.62),
                                    Inches(0.34), Inches(0.5))
            ar.fill.solid(); ar.fill.fore_color.rgb = MUT
            ar.line.fill.background(); ar.shadow.inherit = False

    # feedback arrow (right -> left) below the row
    fy = y + bh + Inches(0.55)
    fa = s.shapes.add_shape(MSO_SHAPE.LEFT_ARROW, x + Inches(0.4), fy,
                            total - Inches(0.8), Inches(0.55))
    fa.fill.solid(); fa.fill.fore_color.rgb = PANEL2
    fa.line.color.rgb = VIOLET; fa.line.width = Pt(1)
    fa.shadow.inherit = False
    ftf = fa.text_frame; ftf.vertical_anchor = MSO_ANCHOR.MIDDLE
    fp = ftf.paragraphs[0]; fp.alignment = PP_ALIGN.CENTER
    fr = fp.add_run()
    fr.text = "validated improvements (human-gated) feed back into the AI system — the loop closes"
    fr.font.size = Pt(11); fr.font.bold = True; fr.font.name = FONT; fr.font.color.rgb = VIOLET

    tfn = tx(s, Inches(0.55), Inches(5.9), Inches(12.2), Inches(0.8))
    para(tfn, "30-second example: narrative said \u201cbullish momentum\u201d while India VIX jumped 15% → PRISM consistency "
              "evaluator failed the run → root cause: prompt under-weighted volatility → prompt v2 → same scenario re-run → "
              "pass → reliability score +1.",
         size=11.5, color=MUT, first=True, italic=True)

    notes(s, "One diagram, four boxes plus a feedback arrow — exactly the required workflow. "
             "Close the loop verbally with the concrete example at the bottom of the slide.")
    footer(s, 5)


def slide_impact(prs):
    s = new_slide(prs)
    title_bar(s, 6, "Impact & Future Scope",
              "Key benefits, real-world impact, scalability, and future enhancements")

    tf = tx(s, Inches(0.55), Inches(1.75), Inches(6.9), Inches(4.7))
    bullets(tf, [
        ("Impact: ", "literate, informed first-time investors — decisions based on evidence, not tips or panic"),
        ("Trust: ", "AI explanations that are auditable — every number traceable to a visible signal, guarded by advice-safety checks"),
        ("Measurable: ", "PRISM reliability score and failure-to-fix velocity tracked monthly as an executive artifact"),
        ("Scale: ", "100% free data stack (Yahoo Finance, Google News, NSE) + serverless deployment → near-zero marginal cost per user"),
    ], size=14, space_after=10)

    # right: future scope chips
    fx = Inches(7.9)
    tff = tx(s, fx, Inches(1.85), Inches(4.8), Inches(0.5))
    para(tff, "Future scope", size=14, color=ACCENT, bold=True, first=True)
    futures = ["US market coverage", "Portfolio-level monitoring", "Hindi & regional languages",
               "Daily digest alerts", "Voice mode", "Bias evaluators", "Mobile app",
               "Paper-portfolio tracking"]
    cw, chh = Inches(2.3), Inches(0.44)
    for i, label in enumerate(futures):
        cx = fx + (cw + Inches(0.18)) * (i % 2)
        cy = Inches(2.45) + (chh + Inches(0.18)) * (i // 2)
        chip(s, cx, cy, cw, chh, label, fill=PANEL, color=TEXT, size=10.5)

    tfe = tx(s, Inches(0.55), Inches(6.1), Inches(12.2), Inches(0.6))
    para(tfe, "\u201cWe don't promise returns — we promise that every explanation we show can be proven correct.\u201d",
         size=13, color=WHITE, bold=True, first=True, italic=True)

    notes(s, "Close on the trust line: beginners don't fear markets because markets are risky — "
             "they fear them because nobody explains them. MarketPulse explains, and PRISM proves "
             "the explanations keep getting better.")
    footer(s, 6)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    prs = Presentation()
    prs.slide_width = SW
    prs.slide_height = SH

    cover(prs)
    slide_problem(prs)
    slide_challenges(prs)
    slide_solution(prs)
    slide_prism(prs)
    slide_workflow(prs)
    slide_impact(prs)

    prs.save(OUT)
    print(f"SAVED {OUT} with {len(prs.slides.slides if hasattr(prs.slides,'slides') else prs.slides._sldIdLst)} slides")

    # verify round-trip
    check = Presentation(OUT)
    print(f"VERIFY reopened OK: {len(check.slides._sldIdLst)} slides")


if __name__ == "__main__":
    main()
