from worker.lang_detect import needs_translation


def test_english_readme_does_not_require_translation() -> None:
    text = (
        "# Project\n\nThis is a small tool for developers. "
        "It helps you build things faster.\n\n"
    ) * 40
    assert not needs_translation(text)


def test_chinese_readme_requires_translation() -> None:
    text = "# 项目\n\n这是一个用于构建工具的中文说明，包含安装、配置和常见问题。\n\n" * 20
    assert needs_translation(text)


def test_mixed_readme_requires_translation() -> None:
    text = "# Project\n\nA great tool for developers who build things every day.\n\n" * 40
    text += "## 中文说明\n\n这是一个中文说明，介绍安装与配置步骤。\n\n" * 10
    assert needs_translation(text)


def test_chinese_only_in_code_block_is_ignored() -> None:
    text = "English prose about the project and its usage. " * 150
    text += "\n\n```python\n# 中文注释\nprint('你好')\n```\n"
    assert not needs_translation(text)


def test_short_chinese_fragment_is_ignored() -> None:
    text = "# Project\n\nEnglish description with the word 中文 only once."
    assert not needs_translation(text)


def test_spanish_readme_requires_translation() -> None:
    sentence = (
        "Esta herramienta es para los desarrolladores. Cuando pueden, todos los usuarios "
        "desde entre sobre también muy donde cada otro otra siempre trabajan con esto. "
    )
    assert needs_translation(sentence * 20)
