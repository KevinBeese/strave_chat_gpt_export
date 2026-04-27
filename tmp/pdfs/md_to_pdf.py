from pathlib import Path
import re
import sys

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted
except Exception as e:
    print(f"IMPORT_ERROR: {e}")
    sys.exit(2)


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build(md_path: Path, pdf_path: Path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    styles = getSampleStyleSheet()

    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=8)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, spaceBefore=6, spaceAfter=6)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=4, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=14)
    bullet = ParagraphStyle("Bullet", parent=body, leftIndent=14)
    mono = ParagraphStyle("Mono", parent=styles["Code"], fontName="Courier", fontSize=8.5, leading=11)

    story = []
    in_code = False
    code_lines = []

    def flush_code():
        nonlocal code_lines
        if code_lines:
            story.append(Preformatted("\n".join(code_lines), mono))
            story.append(Spacer(1, 4))
            code_lines = []

    for raw in lines:
        line = raw.rstrip("\n")

        if line.startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
                code_lines = []
            continue

        if in_code:
            code_lines.append(line)
            continue

        if not line.strip():
            story.append(Spacer(1, 4))
            continue

        if line.startswith("### "):
            story.append(Paragraph(esc(line[4:].strip()), h3))
            continue
        if line.startswith("## "):
            story.append(Paragraph(esc(line[3:].strip()), h2))
            continue
        if line.startswith("# "):
            story.append(Paragraph(esc(line[2:].strip()), h1))
            continue

        if line.startswith("- "):
            story.append(Paragraph("• " + esc(line[2:].strip()), bullet))
            continue

        if re.match(r"^\d+\.\s+", line):
            story.append(Paragraph(esc(line), body))
            continue

        if line.startswith("|") and line.endswith("|"):
            # keep markdown tables as monospace rows for reliable rendering
            story.append(Preformatted(line, mono))
            continue

        story.append(Paragraph(esc(line), body))

    if in_code:
        flush_code()

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Strava Export App - Gesamtuebersicht",
        author="Codex",
    )
    doc.build(story)


if __name__ == "__main__":
    src = Path("output/app-uebersicht-export.md")
    dst = Path("output/pdf/app-uebersicht-export.pdf")
    build(src, dst)
    print(dst)
