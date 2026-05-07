"""Tests for build_post_map.py — embedding cache skip logic.

Guards against unnecessary OpenAI API calls (= real money).
"""

import json
import os
import tempfile
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
