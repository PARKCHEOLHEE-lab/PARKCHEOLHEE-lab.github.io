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
            "embed_chunks": [f"text for {s}"],
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

    def test_cached_multichunk_post_is_reembedded(self, tmp_data_dir):
        """A cached post that is multi-chunk must still be re-embedded: its
        pooled vector depends on the current chunking, so a slug-only cache
        entry (e.g. one made under the old truncation) is stale. The cached
        single-chunk companion must stay cached. Reproduced-bug, PR #87 round 1."""
        cache = {
            "mathy": np.random.randn(FAKE_DIM).tolist(),
            "solo": np.random.randn(FAKE_DIM).tolist(),
        }
        with open(tmp_data_dir / "embeddings.json", "w") as f:
            json.dump(cache, f)

        multichunk = {
            "title": "Post mathy", "slug": "mathy", "url": "/mathy/",
            "category": "note", "label": "Note", "connected": [],
            "embed_chunks": ["chunk one", "chunk two"],
        }
        singlechunk = _fake_posts(["solo"])[0]  # embed_chunks == ["text for solo"]

        mock_client = MagicMock()
        with patch.object(bpm, "load_posts", return_value=[multichunk, singlechunk]), \
             patch.object(bpm, "get_embeddings", return_value=_fake_embedding(1)) as mock_embed, \
             patch.object(bpm, "OpenAI", return_value=mock_client):
            bpm.main()

        mock_embed.assert_called_once()
        assert [p["slug"] for p in mock_embed.call_args[0][0]] == ["mathy"]


class TestChunkToTokenLimit:
    """Over-budget inputs are split into chunks that each stay under the
    8192-token API limit, counted with the model's own tokenizer. Char-count
    heuristics undercount dense-tokenizing text (compatibility jamo, emoji,
    digit runs) — found by review reproduction on PR #87. Chunking replaces
    truncation so the whole post is embedded, not just its head."""

    def _count(self, text):
        return len(bpm._encoding().encode(text))

    def test_long_korean_text_splits_into_under_limit_chunks(self):
        text = "진실은 투명하게 전달되지 않는다 " * 2000
        chunks = bpm.chunk_to_token_limit(text)
        assert len(chunks) >= 2
        for c in chunks:
            assert self._count(c) <= bpm.EMBED_TOKEN_LIMIT

    def test_compatibility_jamo_text_splits_into_under_limit_chunks(self):
        text = "ㅋ" * 32000
        chunks = bpm.chunk_to_token_limit(text)
        assert len(chunks) >= 2
        for c in chunks:
            assert self._count(c) <= bpm.EMBED_TOKEN_LIMIT

    def test_chunks_keep_head_and_tail(self):
        # the point of chunking over truncation: coverage beyond the first window
        text = "우리는 스스로 거짓의 세계를 만든다 " * 2000
        chunks = bpm.chunk_to_token_limit(text)
        assert len(chunks) >= 2
        assert text.startswith(chunks[0])                 # first chunk is a head prefix
        assert sum(len(c) for c in chunks) > len(chunks[0])  # tail is kept, not discarded

    def test_short_mixed_text_is_single_unchanged_chunk(self):
        text = "some truth. 진실은 순수한 상태로 남아있지 않는다."
        assert bpm.chunk_to_token_limit(text) == [text]

    def test_long_text_under_limit_is_single_unchanged_chunk(self):
        # long-but-under-budget input must stay byte-identical so cached
        # embeddings for existing posts remain valid
        text = "word " * 4000
        assert bpm.chunk_to_token_limit(text) == [text]


class TestChunkPooling:
    """Disconfirming test for method 2: an over-budget post must embed to the
    token-weighted mean of ALL its chunk vectors (L2-renormalized), not to just
    its first chunk (which is what truncation produced)."""

    def test_over_limit_post_pools_weighted_average_not_first_chunk(self):
        budget = bpm.EMBED_TOKEN_LIMIT - bpm.EMBED_TOKEN_MARGIN
        text = "word " * (budget + 2000)  # comfortably past one window
        chunks = bpm.chunk_to_token_limit(text)
        assert len(chunks) >= 2, "test needs a multi-chunk post"

        enc = bpm._encoding()
        token_lens = [len(enc.encode(c)) for c in chunks]
        # a distinct, non-zero vector per chunk so the weighted mean is unambiguous
        fake_vectors = [
            [float(i + 1), float((i + 1) ** 2), 1.0, -float(i + 1)]
            for i in range(len(chunks))
        ]

        class FakeEmbeddings:
            def create(self, model, input):
                assert len(input) == len(chunks)
                return SimpleNamespace(
                    data=[SimpleNamespace(embedding=v) for v in fake_vectors]
                )

        client = SimpleNamespace(embeddings=FakeEmbeddings())
        result = bpm.get_embeddings([{"slug": "big", "embed_chunks": chunks}], client)

        expected = np.average(np.array(fake_vectors), axis=0, weights=token_lens)
        expected = expected / np.linalg.norm(expected)

        assert result.shape == (1, 4)
        np.testing.assert_allclose(result[0], expected, rtol=1e-6, atol=1e-9)
        # truncation would have returned the first chunk's vector — it must NOT
        assert not np.allclose(result[0], fake_vectors[0])

    def test_under_limit_post_passes_embedding_through_unchanged(self):
        # single-chunk posts get the API vector verbatim (no renorm drift), so
        # existing cached posts keep identical coordinates
        chunks = bpm.chunk_to_token_limit("a short post")
        assert chunks == ["a short post"]
        raw = [0.3, 0.4, 0.5, 0.6]  # deliberately non-unit

        class FakeEmbeddings:
            def create(self, model, input):
                return SimpleNamespace(data=[SimpleNamespace(embedding=raw)])

        client = SimpleNamespace(embeddings=FakeEmbeddings())
        result = bpm.get_embeddings([{"slug": "small", "embed_chunks": chunks}], client)
        np.testing.assert_array_equal(result[0], np.array(raw))


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


class TestRequestTokenBudget:
    """The API caps total tokens across all inputs in one request (300k),
    separate from the per-input cap. get_embeddings must split chunks across
    requests so no single call exceeds that cap. Reproduced-bug, PR #87 round 2."""

    def test_chunks_split_across_requests_each_under_budget(self):
        enc = bpm._encoding()
        posts = [
            {"slug": f"p{i}", "embed_chunks": [f"post number {i} " * 50]}
            for i in range(4)
        ]
        per = [len(enc.encode(p["embed_chunks"][0])) for p in posts]
        budget = per[0] + per[1] + 1  # fits ~2 posts per request, forcing a split

        calls = []

        class FakeEmbeddings:
            def create(self, model, input):
                calls.append(list(input))
                return SimpleNamespace(
                    data=[SimpleNamespace(embedding=[1.0, 2.0, 3.0, 4.0]) for _ in input]
                )

        client = SimpleNamespace(embeddings=FakeEmbeddings())
        with patch.object(bpm, "EMBED_REQUEST_TOKEN_LIMIT", budget), \
             patch.object(bpm, "EMBED_REQUEST_TOKEN_MARGIN", 0):
            result = bpm.get_embeddings(posts, client)

        assert len(calls) >= 2, "expected multiple requests under the token budget"
        for inputs in calls:
            assert sum(len(enc.encode(t)) for t in inputs) <= budget
        # every chunk still embedded, one vector per post
        assert sorted(t for c in calls for t in c) == sorted(p["embed_chunks"][0] for p in posts)
        assert result.shape == (4, 4)
