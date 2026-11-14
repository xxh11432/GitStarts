"""README 语言判定：判断正文是否需要翻译成英文。

判定只看“正文”：先剔除代码块、行内代码、URL、图片/链接语法，避免代码注释和徽章链接里的
中文把英文 README 误判成非英文。两条规则：

1. 非拉丁字符（中日韩/西里尔/阿拉伯等）达到阈值，直接判定为非英文，混排文档同样命中；
2. 全是拉丁字符时，用高频功能词做语种判别，命中即视为非英文（如西班牙语 README）。
"""

from __future__ import annotations

import re
import unicodedata

_FENCED = re.compile(r"```.*?```", re.DOTALL)
_INLINE = re.compile(r"`[^`\n]*`")
_URL = re.compile(r"https?://\S+")
_HTML = re.compile(r"</?[a-zA-Z][^>]*>")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")

_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_KANA = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff]")
_HANGUL = re.compile(r"[\uac00-\ud7af\u1100-\u11ff]")
_CYRILLIC = re.compile(r"[\u0400-\u04ff]")
_ARABIC = re.compile(r"[\u0600-\u06ff\u0750-\u077f]")
_HEBREW = re.compile(r"[\u0590-\u05ff]")
_THAI = re.compile(r"[\u0e00-\u0e7f]")
_DEVANAGARI = re.compile(r"[\u0900-\u097f]")
_GREEK = re.compile(r"[\u0370-\u03ff]")
_LATIN = re.compile(r"[A-Za-z\u00c0-\u024f]")
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
_COMBINING = dict.fromkeys(i for i in range(0x300, 0x370))

# 非拉丁字符达到该数量即视为需要翻译（同时覆盖中英混排 README）
MIN_SCRIPT_CHARS = 50
# 拉丁语系判别的样本门槛：太短的 README 只靠功能词不可靠
MIN_TOKENS = 200
MAX_ENGLISH_RATE = 0.05
MIN_OTHER_RATE = 0.05
MIN_DISTINCT_WORDS = 5

# 已去掉与英文技术文档高度重叠的歧义词（如 com / met / die / will / was / todo / solo 等）
_WORDS: dict[str, str] = {
    "en": (
        "the of and to in is are for with that this on as be by or from at an it you "
        "your we our can will not have has was were but all one more most other some "
        "such only own same so than too very its their there they them these those "
        "which who whom whose what when where why how"
    ),
    "es": (
        "para como pero porque cuando desde entre sobre tambien segun puede puedes "
        "todos todas esto esta estos estas despues muy donde quien hasta cada otro "
        "otra otros otras mismo misma siempre"
    ),
    "pt": (
        "para como mais nao uma voce tambem pelo pela muito das isso isto este esta "
        "pode podem durante apos sem sobre entre quando onde qual quais toda todos "
        "todas outro outra outros outras mesmo mesma ainda depois"
    ),
    "fr": (
        "les des pour avec dans une sur par aux cette ces qui que pas plus vous nous "
        "etre fait comme mais donc tout tous toute toutes sans sous vers chez leur "
        "leurs notre vos votre mon mes ses son sa sont elle ils elles avoir aussi "
        "bien peut entre"
    ),
    "de": (
        "der die das und ist nicht mit fur auf eine von den dem sich auch werden wird "
        "wurde wurden sind waren sein hat haben kann konnen muss mussen soll sollen "
        "wollen als bei aus nach uber unter zwischen durch gegen ohne aber oder wenn "
        "dann nur noch schon sehr mehr wie wer wo diese dieser dieses"
    ),
    "it": (
        "gli del della dei delle che per con una non piu anche come sono essere hanno "
        "nel nella nei nelle alla alle dal dalla dai dalle suo sua suoi sue questo "
        "questa questi queste degli tra fra senza ogni quando dove molto ancora"
    ),
    "vi": (
        "cua cac duoc trong khong voi nhung nguoi cung rat nhieu hon nen theo tren "
        "duoi giua sau truoc moi mot cho cai chung toi minh"
    ),
    "tr": "bir icin ile olarak cok daha gibi kadar sonra ama veya hem degil yok olan olur",
    "id": (
        "dan yang untuk dengan ini itu dari tidak akan pada adalah atau juga karena "
        "bisa telah sudah sebagai dalam oleh mereka kita kami saya anda dia"
    ),
    "pl": (
        "nie sie jest ze jak dla oraz przez tak juz tylko jeszcze bardzo moze byc sa "
        "byl byla bylo byli byly maja ktory ktora ktore tego tej tym przy pod nad"
    ),
    "nl": (
        "het een van voor met op dat die niet zijn wordt worden ook als bij naar uit "
        "maar of door over tot dan nog wel deze dit heeft hebben kan kunnen moet "
        "moeten tussen zonder tijdens"
    ),
}
_STOPWORDS = {lang: frozenset(words.split()) for lang, words in _WORDS.items()}


def _prose(content: str) -> str:
    text = _FENCED.sub(" ", content)
    text = _INLINE.sub(" ", text)
    text = _IMAGE.sub(" ", text)
    text = _URL.sub(" ", text)
    text = _LINK.sub(r"\1", text)
    return _HTML.sub(" ", text)


def _normalize(word: str) -> str:
    return unicodedata.normalize("NFD", word).translate(_COMBINING).lower()


def non_latin_chars(content: str) -> int:
    text = _prose(content)
    return sum(
        len(pattern.findall(text))
        for pattern in (
            _CJK,
            _KANA,
            _HANGUL,
            _CYRILLIC,
            _ARABIC,
            _HEBREW,
            _THAI,
            _DEVANAGARI,
            _GREEK,
        )
    )


def latin_language_rate(content: str) -> tuple[str, float, float, int]:
    """返回 (最可能的非英语种, 该语种功能词占比, 英语功能词占比, 命中词种数)。"""
    words = _WORD.findall(_prose(content))
    tokens = [token for token in (_normalize(word) for word in words) if len(token) >= 3]
    if not tokens:
        return "", 0.0, 0.0, 0
    rates: dict[str, float] = {}
    distinct: dict[str, int] = {}
    for lang, stopwords in _STOPWORDS.items():
        hits = [token for token in tokens if token in stopwords]
        rates[lang] = len(hits) / len(tokens)
        distinct[lang] = len(set(hits))
    best = max((lang for lang in rates if lang != "en"), key=lambda item: rates[item])
    return best, rates[best], rates.get("en", 0.0), distinct.get(best, 0)


def needs_translation(content: str) -> bool:
    """README 正文只要包含足量非英文内容（含混排）就返回 True。"""
    if not content or not content.strip():
        return False
    if non_latin_chars(content) >= MIN_SCRIPT_CHARS:
        return True
    best, best_rate, english_rate, distinct = latin_language_rate(content)
    return (
        bool(best)
        and best_rate >= MIN_OTHER_RATE
        and english_rate < MAX_ENGLISH_RATE
        and distinct >= MIN_DISTINCT_WORDS
    )
