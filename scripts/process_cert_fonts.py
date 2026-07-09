# 사용법:
#   pip install fonttools
#   python scripts/process_cert_fonts.py <원본.ttf> <출력.ttf>
#   예) python scripts/process_cert_fonts.py NotoSansKR-Regular.ttf public/fonts/NotoSansKR-Regular-Cert.ttf
#
# Noto Sans KR을 수료증용으로 가공:
# 1) 한글 음절 전체 + 자모 + 라틴/문장부호로 서브셋
# 2) 복합(composite) 글리프를 단순 윤곽으로 평탄화
#    → @pdf-lib/fontkit 서브셋터의 복합 글리프 GID 재기록 버그를 원천 회피
import sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

src, dst = sys.argv[1], sys.argv[2]

font = TTFont(src)

opts = Options()
opts.layout_features = []          # GSUB/GPOS 기능 제거(단순 drawText 용도)
opts.hinting = False               # 힌팅 제거로 용량 절감
opts.drop_tables += ["BASE", "GDEF", "GPOS", "GSUB", "vhea", "vmtx", "STAT", "gasp"]
subsetter = Subsetter(options=opts)
unicodes = []
unicodes += list(range(0x0020, 0x007F))   # Basic Latin
unicodes += [0x00B7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026]  # 문장부호
unicodes += list(range(0x3000, 0x3040))   # CJK 기호/전각 공백·괄호
unicodes += list(range(0x3130, 0x3190))   # 한글 호환 자모
unicodes += list(range(0xAC00, 0xD7A4))   # 한글 음절 전체(11,172자)
unicodes += list(range(0xFF01, 0xFF61))   # 전각 영숫자/괄호
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)

# 복합 글리프 평탄화
glyf = font["glyf"]
glyph_set = font.getGlyphSet()
hmtx = font["hmtx"]
flattened = 0
for name in font.getGlyphOrder():
    glyph = glyf[name]
    if glyph.isComposite():
        pen = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(pen)
        tpen = TTGlyphPen(None)
        pen.replay(tpen)
        glyf[name] = tpen.glyph()
        flattened += 1

# 평탄화 후 남은 복합 글리프 확인
remaining = sum(1 for n in font.getGlyphOrder() if glyf[n].isComposite())

# 3) 모든 글리프 데이터를 짝수 길이로 패딩(glyf.padding=2)
#    @pdf-lib/fontkit의 TTFSubset은 홀수 길이 글리프 뒤에 패딩을 넣지 않아
#    short-loca(오프셋/2 저장) 서브셋이 1바이트씩 밀려 글자가 깨진다.
#    소스 글리프가 전부 짝수 길이면 서브셋 오프셋도 항상 짝수라 버그가 발동하지 않는다.
glyf.padding = 2

font.save(dst)
print(f"{src} -> {dst}: flattened={flattened}, remaining_composites={remaining}, "
      f"glyphs={len(font.getGlyphOrder())}")
