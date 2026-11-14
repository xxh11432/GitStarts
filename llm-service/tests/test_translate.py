from worker.translate import _mask_code_blocks, _restore_code_blocks, split_windows


def test_code_blocks_are_masked_and_restored() -> None:
    text = "Intro paragraph.\n\n```bash\necho 你好\n```\n\nOutro paragraph."
    masked, blocks = _mask_code_blocks(text)
    assert "echo 你好" not in masked
    assert "[[CODE_BLOCK_0]]" in masked

    restored = _restore_code_blocks(masked.replace("Intro", "Intro translated"), blocks)
    assert "```bash\necho 你好\n```" in restored
    assert "Intro translated" in restored


def test_split_windows_keeps_limit_and_content() -> None:
    text = "\n\n".join(f"paragraph {index} " * 20 for index in range(50))
    windows = split_windows(text, 500)
    assert len(windows) > 1
    assert all(len(window) <= 500 for window in windows)
    assert sum(window.count("paragraph") for window in windows) == 50 * 20


def test_split_windows_breaks_oversized_block() -> None:
    text = "x" * 1500
    windows = split_windows(text, 500)
    assert len(windows) == 3
    assert all(len(window) <= 500 for window in windows)
    assert "".join(windows) == text
