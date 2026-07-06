"""Tests for build_post_map.py — embedding cache skip logic.

Guards against unnecessary OpenAI API calls (= real money).
"""

import json
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

import numpy as np
import pytest

import build_post_map as bpm


@pytest.fixture
def tmp_data_dir(tmp_path):
    """Redirect DATA_DIR / paths to a temp directory."""
    with patch.object(bpm, "DATA_DIR", str(tmp_path)), \
         patch.object(bpm, "EMBEDDINGS_PATH", str(tmp_path / "embeddings.json")), \
         patch.object(bpm, "LATENTSPACE_PATH", str(tmp_path / "latentspace.json")):
        yield tmp_path


FAKE_DIM = 8


def _fake_posts(slugs):
    return [
        {
            "title": f"Post {s}",
            "slug": s,
            "url": f"/{s}/",
            "category": "note",
            "label": "Note",
            "connected": [],
            "embed_text": f"text for {s}",
        }
        for s in slugs
    ]


def _fake_embedding(n=1):
    rng = np.random.RandomState(42)
    return rng.randn(n, FAKE_DIM)


class TestCacheSkip:
    """Verify that cached slugs skip the API call."""

    def test_all_cached_skips_api(self, tmp_data_dir):
        """When all slugs exist in cache, get_embeddings must NOT be called."""
        slugs = ["aaa", "bbb", "ccc"]
        cache = {s: np.random.randn(FAKE_DIM).tolist() for s in slugs}
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        posts = _fake_posts(slugs)

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", wraps=bpm.get_embeddings) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_not_called()

    def test_partial_cache_embeds_only_new(self, tmp_data_dir):
        """When some slugs are cached, only new ones hit the API."""
        cached_slugs = ["aaa", "bbb"]
        new_slugs = ["ccc"]
        all_slugs = cached_slugs + new_slugs

        cache = {s: np.random.randn(FAKE_DIM).tolist() for s in cached_slugs}
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        posts = _fake_posts(all_slugs)

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(len(new_slugs))) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_called_once()
        embedded_posts = mock_embed.call_args[0][0]
        assert [p["slug"] for p in embedded_posts] == new_slugs

    def test_empty_cache_embeds_all(self, tmp_data_dir):
        """When cache is empty, all posts are embedded."""
        slugs = ["aaa", "bbb", "ccc"]
        posts = _fake_posts(slugs)

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(len(slugs))) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_called_once()
        embedded_posts = mock_embed.call_args[0][0]
        assert [p["slug"] for p in embedded_posts] == slugs

    def test_deleted_post_removed_from_cache(self, tmp_data_dir):
        """Slugs in cache but not in posts should be pruned."""
        cache = {s: np.random.randn(FAKE_DIM).tolist() for s in ["aaa", "bbb", "deleted"]}
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        posts = _fake_posts(["aaa", "bbb", "new"])

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(1)) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        saved = json.load(open(tmp_data_dir / "embeddings.json"))
        assert "deleted" not in saved
        assert set(saved.keys()) == {"aaa", "bbb", "new"}

    def test_output_json_has_all_posts(self, tmp_data_dir):
        """latentspace.json should contain all posts with valid coords."""
        slugs = ["aaa", "bbb", "ccc"]
        cache = {s: np.random.randn(FAKE_DIM).tolist() for s in slugs}
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        posts = _fake_posts(slugs)

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        output = json.load(open(tmp_data_dir / "latentspace.json"))
        assert len(output) == len(slugs)
        for entry in output:
            assert 0.0 <= entry["x"] <= 1.0
            assert 0.0 <= entry["y"] <= 1.0

    def test_pca_determinism(self, tmp_data_dir):
        """Same embeddings should produce identical coordinates."""
        slugs = ["aaa", "bbb", "ccc"]
        rng = np.random.RandomState(123)
        cache = {s: rng.randn(FAKE_DIM).tolist() for s in slugs}

        posts = _fake_posts(slugs)
        mock_client = MagicMock()

        results = []
        for _ in range(2):
            with open(tmp_data_dir / "embeddings.json", "w") as f:
                json.dump(cache, f)
            with patch.object(bpm, "load_posts", return_value=posts), \
                 patch.object(bpm, "OpenAI", return_value=mock_client):
                bpm.main()
            results.append(json.load(open(tmp_data_dir / "latentspace.json")))

        for a, b in zip(results[0], results[1]):
            assert a["x"] == b["x"]
            assert a["y"] == b["y"]

    def test_consecutive_runs_skip_api(self, tmp_data_dir):
        """Running main() twice in a row: second run must not call API."""
        slugs = ["aaa", "bbb", "ccc"]
        posts = _fake_posts(slugs)
        mock_client = MagicMock()

        # First run: embed everything
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(len(slugs))) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()
        assert mock_embed.call_count == 1

        # Second run: cache should cover all slugs
        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", wraps=bpm.get_embeddings) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()
        mock_embed.assert_not_called()

    def test_deleted_post_pruned_without_new_posts(self, tmp_data_dir):
        """Stale cache entries should be pruned even when no new posts exist."""
        cache = {s: np.random.randn(FAKE_DIM).tolist() for s in ["aaa", "bbb", "deleted"]}
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        # Only aaa and bbb remain — no new posts, but "deleted" should be pruned
        posts = _fake_posts(["aaa", "bbb"])
        mock_client = MagicMock()

        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", wraps=bpm.get_embeddings) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_not_called()
        saved = json.load(open(tmp_data_dir / "embeddings.json"))
        assert "deleted" not in saved
        assert set(saved.keys()) == {"aaa", "bbb"}

    def test_corrupt_cache_triggers_full_embed(self, tmp_data_dir):
        """If cache file is corrupt JSON, all posts should be re-embedded."""
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            f.write("{broken json")

        slugs = ["aaa", "bbb"]
        posts = _fake_posts(slugs)
        mock_client = MagicMock()

        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(len(slugs))) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_called_once()
        embedded_posts = mock_embed.call_args[0][0]
        assert len(embedded_posts) == len(slugs)

    def test_no_cache_file_embeds_all(self, tmp_data_dir):
        """If embeddings.json doesn't exist, all posts should be embedded."""
        assert not os.path.exists(tmp_data_dir / "embeddings.json")

        slugs = ["aaa", "bbb"]
        posts = _fake_posts(slugs)
        mock_client = MagicMock()

        with patch.object(bpm, "load_posts", return_value=posts), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(len(slugs))) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_called_once()
        assert len(mock_embed.call_args[0][0]) == len(slugs)


class TestClipToTokenLimit:
    """Embedding inputs must stay under the 8192-token API limit, counted
    with the model's own tokenizer. Char-count heuristics undercount
    dense-tokenizing text (compatibility jamo, emoji, digit runs) — found
    by review reproduction on PR #87."""

    def _count(self, text):
        return len(bpm._encoding().encode(text))

    def test_long_korean_text_is_clipped_under_limit(self):
        text = "진실은 투명하게 전달되지 않는다 " * 2000
        clipped = bpm.clip_to_token_limit(text)
        assert len(clipped) < len(text)
        assert self._count(clipped) <= bpm.EMBED_TOKEN_LIMIT - bpm.EMBED_TOKEN_MARGIN

    def test_compatibility_jamo_text_is_clipped_under_limit(self):
        text = "ㅋ" * 32000
        clipped = bpm.clip_to_token_limit(text)
        assert self._count(clipped) <= bpm.EMBED_TOKEN_LIMIT - bpm.EMBED_TOKEN_MARGIN

    def test_clipped_text_is_prefix_of_original(self):
        text = "우리는 스스로 거짓의 세계를 만든다 " * 2000
        clipped = bpm.clip_to_token_limit(text)
        assert text.startswith(clipped)

    def test_short_mixed_text_unchanged(self):
        text = "some truth. 진실은 순수한 상태로 남아있지 않는다."
        assert bpm.clip_to_token_limit(text) == text

    def test_long_text_under_limit_unchanged(self):
        # long-but-under-budget input must stay byte-identical so cached
        # embeddings for existing posts remain valid
        text = "word " * 4000
        assert bpm.clip_to_token_limit(text) == text


class TestEmbeddingInputBoundary:
    """End-to-end guard at the API boundary: whatever load_posts() produces,
    main() must hand the embeddings client inputs under the token limit.
    (Adapted from the PR #87 review reproduction artifact.)"""

    def test_dense_post_reaches_client_under_limit(self, tmp_path):
        post_dir = tmp_path / "note" / "_posts"
        post_dir.mkdir(parents=True)
        (post_dir / "2026-01-01-dense.html").write_text(
            "---\ntitle: dense\n---\n<p>" + ("ㅋ" * 32000) + "</p>\n",
            encoding="utf-8",
        )
        (post_dir / "2026-01-02-tiny.html").write_text(
            "---\ntitle: tiny\n---\n<p>short body</p>\n",
            encoding="utf-8",
        )
        (tmp_path / "data").mkdir()

        seen = []

        class FakeEmbeddings:
            def create(self, model, input):
                seen.extend(input)
                return SimpleNamespace(
                    data=[SimpleNamespace(embedding=[float(i), 1.0 - i]) for i, _ in enumerate(input)]
                )

        fake_client = SimpleNamespace(embeddings=FakeEmbeddings())

        with patch.object(bpm, "REPO_ROOT", str(tmp_path)), \
             patch.object(bpm, "DATA_DIR", str(tmp_path / "data")), \
             patch.object(bpm, "EMBEDDINGS_PATH", str(tmp_path / "data" / "embeddings.json")), \
             patch.object(bpm, "LATENTSPACE_PATH", str(tmp_path / "data" / "latentspace.json")), \
             patch.object(bpm, "OpenAI", return_value=fake_client):
            bpm.main()

        assert seen, "embedding client was never called"
        enc = bpm._encoding()
        assert all(len(enc.encode(t)) <= bpm.EMBED_TOKEN_LIMIT for t in seen)
