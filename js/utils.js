var SITE_CONFIG = {
  repo_owner: "PARKCHEOLHEE-lab",
  repo_name: "PARKCHEOLHEE-lab.github.io",
  branches: ["main", "dev"],
  media_base_url: "https://media.githubusercontent.com/media/"
};

function handle_click(event, url) {
  if (event.ctrlKey || event.metaKey) {
    window.open(url, '_blank');
  } else {
    location.href = url;
  }
}

function handle_image_error(img) {
  const tail = img.src.split("/").slice(-3).join("/");
  const base = SITE_CONFIG.media_base_url + SITE_CONFIG.repo_owner + "/" + SITE_CONFIG.repo_name + "/refs/heads/";
  const tried = img.dataset.fallback_tried || "";
  const branches = SITE_CONFIG.branches;

  for (let i = 0; i < branches.length; i++) {
    if (tried === "" && i === 0) {
      img.dataset.fallback_tried = branches[i];
      img.src = base + branches[i] + "/" + tail;
      return;
    }
    if (tried === branches[i] && i + 1 < branches.length) {
      img.dataset.fallback_tried = branches[i + 1];
      img.src = base + branches[i + 1] + "/" + tail;
      return;
    }
  }
  // every copy failed: the image's skeleton (basic.sass) stops promising an image that is not on its way
  img.onerror = null;
  img.removeAttribute("data-skeleton");
}

function resize_iframe(obj) {
  try {
    obj.style.height = obj.contentWindow.document.documentElement.scrollHeight + 'px';
    document.getElementById('notebook-container').style.height = obj.style.height;
  } catch (e) {
    console.error("Iframe resize failed:", e);
  }
}

function generate_table_of_contents() {
  try {
    let toc = "<ul class='section-nav'>";
    const h3h4_tags = document.querySelectorAll("h3, h4");

    for (let i = 0; i < h3h4_tags.length; i++) {
      const h_tag = h3h4_tags[i];
      h_tag.id = h_tag.innerText.toLowerCase().replaceAll(" ", "-");

      if (h_tag.nodeName === "H3") {
        toc += "<li><a href=\"#" + h_tag.id + "\">" + h_tag.innerText + "</a></li>";
      } else {
        toc += "<ul><li><a href=\"#" + h_tag.id + "\">" + h_tag.innerText + "</a></li></ul>";
      }
    }

    toc += "</ul><br><br>";
    const toc_element = document.getElementById("toc");
    if (toc_element != null) {
      toc_element.innerHTML += toc;
    }
  } catch (e) {
    console.error("TOC generation failed:", e);
  }
}

function filter_posts(type) {
  const posts = document.querySelectorAll(".testbed-post");
  const back_button = document.getElementById("back-button");
  const filter_buttons = document.getElementById("filter-buttons");

  posts.forEach(function(post) {
    if (type === "all") {
      post.style.display = "";
    } else {
      post.style.display = post.dataset[type] === "true" ? "" : "none";
    }
  });

  if (type === "all") {
    back_button.style.display = "none";
    filter_buttons.style.display = "";
  } else {
    back_button.style.display = "";
    filter_buttons.style.display = "none";
  }
}

// The Manifest list and its side panel. Sort by orders the rows newest or oldest first, by title, or
// by type. A checkbox per post type (read from each row's emoji, with its post count) shows the
// checked types' rows, all of them at first; with none checked the list is empty. Pinned rows stay on
// top in their build order under every sort (a pinned page has no date), and the build order (newest
// first) is the start. A press on a type and a drag over others sets them all. The search box keeps
// the rows whose title or text has every word typed, each with a piece of its text from the first one
// beside its title. A choice other than the start stays in the page's address.
function setup_note_list() {
  const list = document.getElementById("note-list");
  const panel = document.querySelector(".note-filter");
  const filter = document.getElementById("note-type-filter");
  const sort = document.getElementById("note-sort");
  const search = document.getElementById("note-search");
  const found = search.parentElement.querySelector(".note-search-count");
  const clear = search.parentElement.querySelector(".note-search-clear");
  const PIN = "/emoji/pin.png";
  // the names the latent-space map shows beside the same icons (LABEL_EMOJIS in js/latentspace.js);
  // any other type is named after its icon file, capitalized
  const TYPE_NAMES = { "default": "Note", "puzzle": "Testbed", "wordballoon-with-dots": "Wordballoon" };
  // an empty note is a note, for the filter and the type sort; its row keeps its own icon
  const SAME_TYPE = { "/emoji/default-empty.png": "/emoji/default.png" };

  const rows = Array.from(list.querySelectorAll(".note-post-item")).map(function(item, index) {
    const icon = item.querySelector(".emoji-image").getAttribute("src");
    return {
      item: item,
      index: index,
      type: SAME_TYPE[icon] || icon,
      title: item.querySelector(".post-title").textContent.trim(),
      time: Date.parse(item.querySelector("time").getAttribute("datetime")),
      url: item.dataset.url,
      // the post's text from search.json, and its title and text in lower case to match against
      text: "",
      haystack: null
    };
  });
  const counts = {};
  rows.forEach(function(row) {
    counts[row.type] = (counts[row.type] || 0) + 1;
  });
  // Testbed first, as the owner asked, then the most common type first; types with equal counts keep
  // the order they first appear in. The Type sort follows the same order
  const TESTBED = "/emoji/puzzle.png";
  const types = Object.keys(counts).sort(function(a, b) {
    return (b === TESTBED) - (a === TESTBED) || counts[b] - counts[a];
  });
  // each type's name as the panel shows it; the page's address uses it in lower case
  const names = {};
  types.forEach(function(type) {
    const stem = type.split("/").pop().replace(".png", "");
    names[type] = TYPE_NAMES[stem] || stem.charAt(0).toUpperCase() + stem.slice(1);
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  // the checked types, the sort and the words typed in the search box
  const state = { types: new Set(types), sort: "newest", query: "" };
  // search.json, fetched once, the first time the search box is used
  let loaded = false;
  let loading = null;

  function compare(a, b) {
    if (a.type === PIN || b.type === PIN) {
      return (b.type === PIN) - (a.type === PIN) || a.index - b.index;
    }
    let order = 0;
    if (state.sort === "newest") {
      order = b.time - a.time;
    } else if (state.sort === "oldest") {
      order = a.time - b.time;
    } else if (state.sort === "title") {
      order = collator.compare(a.title, b.title);
    } else {
      order = types.indexOf(a.type) - types.indexOf(b.type);
    }
    return order !== 0 ? order : a.index - b.index;
  }

  // the words typed, in lower case; lazy: toLowerCase keeps the length of English and Korean text, which
  // the line under a title relies on to mark the words; a language whose letters change length would
  // need the marks found on the original text
  function words() {
    return state.query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function load() {
    if (!loading) {
      loading = fetch(search.dataset.index).then(function(response) {
        return response.json();
      }).then(function(items) {
        // the text keeps the entities of the posts' HTML (&lt;, &amp;), which a textarea decodes
        const decoder = document.createElement("textarea");
        const texts = {};
        items.forEach(function(item) {
          decoder.innerHTML = item.text;
          texts[item.url] = decoder.value;
        });
        rows.forEach(function(row) {
          row.text = texts[row.url] || "";
          row.haystack = (row.title + " " + row.text).toLowerCase();
        });
        loaded = true;
      }).catch(function() {
        // offline, or the file failed: the next word typed tries again
        loading = null;
      });
    }
    return loading;
  }

  // a line of the row's text around the first word found in it, every word typed marked
  function snippet(row, terms) {
    const lower = row.text.toLowerCase();
    let at = -1;
    terms.some(function(term) {
      at = lower.indexOf(term);
      return at >= 0;
    });
    if (at < 0) {
      return null;
    }
    // the piece shares the row's one line with the title, so it starts at most 12 letters before the
    // word, at the start of a word where there is one, and the line cuts the rest
    let start = Math.max(0, at - 12);
    const space = row.text.indexOf(" ", start);
    if (start > 0 && space >= 0 && space < at) {
      start = space + 1;
    }
    const end = Math.min(row.text.length, at + 100);
    const piece = (start > 0 ? "…" : "") + row.text.slice(start, end) + (end < row.text.length ? "…" : "");
    const piece_lower = piece.toLowerCase();
    const line = document.createElement("div");
    line.className = "note-snippet";
    let from = 0;
    while (from < piece.length) {
      let next = -1;
      let size = 0;
      terms.forEach(function(term) {
        const found_at = piece_lower.indexOf(term, from);
        if (found_at >= 0 && (next < 0 || found_at < next)) {
          next = found_at;
          size = term.length;
        }
      });
      if (next < 0) {
        line.append(piece.slice(from));
        break;
      }
      const mark = document.createElement("mark");
      mark.textContent = piece.slice(next, next + size);
      line.append(piece.slice(from, next), mark);
      from = next + size;
    }
    return line;
  }

  function render() {
    const terms = words();
    // the rows show unfiltered until search.json arrives, a moment after the first word
    const searching = terms.length > 0 && loaded;
    let shown = 0;
    rows.slice().sort(compare).forEach(function(row) {
      const visible = state.types.has(row.type) && (!searching || terms.every(function(term) {
        return row.haystack.includes(term);
      }));
      row.item.style.display = visible ? "" : "none";
      const old = row.item.querySelector(".note-snippet");
      if (old) {
        old.remove();
      }
      const line = visible && searching ? snippet(row, terms) : null;
      if (line) {
        row.item.querySelector(".title-wrapper").append(line);
      }
      row.item.classList.toggle("has-snippet", line !== null);
      shown += visible ? 1 : 0;
      list.appendChild(row.item);
    });
    found.textContent = searching ? shown : "";

    filter.querySelectorAll("input").forEach(function(box) {
      box.checked = state.types.has(box.value);
    });
    // the browser may bring back the choice of an earlier visit to the page; the rows follow state
    sort.querySelectorAll("input").forEach(function(radio) {
      radio.checked = radio.value === state.sort;
    });
    write_url();
  }

  // the address keeps a search and a choice other than every type and Newest, so a reload or a shared
  // link shows the same list: /manifest/?q=attention&type=testbed,note&sort=oldest. The plain /manifest/
  // is the start; replaced, not added, so Back leaves the page instead of undoing each click
  function write_url() {
    const parts = [];
    if (state.query.trim()) {
      parts.push("q=" + encodeURIComponent(state.query.trim()));
    }
    if (state.types.size < types.length) {
      parts.push("type=" + types.filter(function(type) {
        return state.types.has(type);
      }).map(function(type) {
        return names[type].toLowerCase();
      }).join(","));
    }
    if (state.sort !== "newest") {
      parts.push("sort=" + state.sort);
    }
    history.replaceState(history.state, "", location.pathname + (parts.length ? "?" + parts.join("&") : "") + location.hash);
  }

  // an address written by hand may name types or a sort that do not exist; those are left out. An
  // empty type= is no type checked
  function read_url() {
    const params = new URLSearchParams(location.search);
    if (params.has("type")) {
      const wanted = params.get("type").toLowerCase().split(",");
      state.types = new Set(types.filter(function(type) {
        return wanted.includes(names[type].toLowerCase());
      }));
    }
    const sorts = Array.from(sort.querySelectorAll("input"), function(radio) {
      return radio.value;
    });
    if (sorts.includes(params.get("sort"))) {
      state.sort = params.get("sort");
    }
    state.query = params.get("q") || "";
    search.value = state.query;
  }

  // one checkbox per type, with the type's icon, its name and its post count
  types.forEach(function(type) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = type;
    const icon = document.createElement("img");
    icon.src = type;
    icon.alt = "";
    icon.className = "note-filter-icon";
    const count = document.createElement("span");
    count.className = "note-filter-count";
    count.textContent = counts[type];
    label.append(box, icon, names[type], count);
    filter.appendChild(label);
  });
  function show_type(type, shown) {
    if (shown) {
      state.types.add(type);
    } else {
      state.types.delete(type);
    }
    render();
  }
  // the keyboard, and a finger's tap
  filter.addEventListener("change", function(event) {
    show_type(event.target.value, event.target.checked);
  });

  // with a mouse or a pen, a press on a type flips it, and dragging over other types gives them the same
  // state; a finger keeps the plain tap, since its drag scrolls the panel
  let pointer = "";
  let drag = null;
  filter.addEventListener("pointerdown", function(event) {
    pointer = event.pointerType;
    const label = event.target.closest("label");
    if (!label || pointer === "touch" || event.button !== 0) {
      return;
    }
    // no text selection while dragging
    event.preventDefault();
    const type = label.querySelector("input").value;
    drag = !state.types.has(type);
    show_type(type, drag);
  });
  document.addEventListener("pointermove", function(event) {
    if (drag === null) {
      return;
    }
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const label = under && under.closest("#note-type-filter label");
    if (label && state.types.has(label.querySelector("input").value) !== drag) {
      show_type(label.querySelector("input").value, drag);
    }
  });
  ["pointerup", "pointercancel"].forEach(function(name) {
    document.addEventListener(name, function() {
      drag = null;
    });
  });
  // the press has already flipped the box, and the click after it would flip it back; a keyboard's
  // click has no count (detail 0)
  filter.addEventListener("click", function(event) {
    if (event.detail > 0 && pointer !== "touch") {
      event.preventDefault();
    }
  });

  sort.addEventListener("change", function(event) {
    state.sort = event.target.value;
    render();
  });

  function find() {
    state.query = search.value;
    clear.hidden = !search.value;
    if (loaded || !words().length) {
      render();
    } else {
      load().then(render);
    }
  }
  clear.addEventListener("click", function() {
    search.value = "";
    find();
    search.focus();
  });
  search.addEventListener("input", find);
  // the file starts loading as the box is entered, before the first word
  search.addEventListener("focus", load);
  // Escape empties the box, as its clear button does
  search.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && search.value) {
      search.value = "";
      find();
    }
  });
  // "/" goes to the search box from anywhere on the page but another text field
  document.addEventListener("keydown", function(event) {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.closest("input, textarea, select, [contenteditable]")) {
      event.preventDefault();
      search.focus();
    }
  });

  read_url();
  panel.hidden = false;
  search.parentElement.hidden = false;
  find();
}

// A post's side panel (post.html): Contents, the list generate_table_of_contents builds in the post's
// #toc, moved in here, and Related. While the post scrolls, Contents marks the section being read, in
// the panel and in its copy in the phone menu (setup_header).
function setup_post_panel() {
  const contents = document.querySelector("#post-side .post-contents");
  const toc = document.getElementById("toc");
  if (!contents || !toc) {
    return;
  }
  const list = toc.querySelector(".section-nav");
  toc.remove();
  if (!list || !list.querySelector("a")) {
    return;
  }
  contents.append(list);
  contents.hidden = false;
  const headings = Array.from(list.querySelectorAll("a"), function(link) {
    // a long heading is cut at the panel's edge (basic.sass); its full words show on hover, as a
    // Related title's do
    link.title = link.textContent;
    return document.getElementById(link.getAttribute("href").slice(1));
  });
  const header = document.querySelector("body > header");
  // the last heading at or above the header's bottom, where a link to it lands (scroll-padding-top), or
  // the last of all once the page can scroll no further; the first while the page is above them all.
  // lazy: a long table of contents scrolls in the panel without following the mark (the longest has 56
  // entries, the next 10); keep the marked entry in view there if it matters
  function mark() {
    const line = header.offsetHeight + 2;
    let current = 0;
    headings.forEach(function(heading, i) {
      if (heading && heading.getBoundingClientRect().top <= line) {
        current = i;
      }
    });
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = headings.length - 1;
    }
    document.querySelectorAll(".post-contents .section-nav").forEach(function(nav) {
      nav.querySelectorAll("a").forEach(function(link, i) {
        if (i === current) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    });
  }
  window.addEventListener("scroll", mark, { passive: true });
  mark();
}

// A post's comments (post.html): the skeleton stands in for giscus's frame (layout.sass) until the frame
// draws the comment box. giscus reports its frame's height to the page, and its loading screen is shorter
// than the empty comment box, the shortest box it draws (the area's min-height): a height at least that tall
// means the box is drawn. Its "Discussion not found" (a post with no comments yet) is no sign, as giscus
// sends it while its loading screen still shows; any other error shows giscus's error at once. With no word
// from it in 10s, blocked or down, the skeleton stops promising comments that are not on their way
function setup_comments() {
  const comments = document.querySelector(".comments");
  if (!comments) {
    return;
  }
  const empty_box = parseFloat(getComputedStyle(comments).minHeight);
  const done = function() {
    comments.removeAttribute("aria-busy");
  };
  window.addEventListener("message", function(event) {
    const giscus = event.origin === "https://giscus.app" && event.data && event.data.giscus;
    if (!giscus) {
      return;
    }
    if (giscus.resizeHeight >= empty_box || (giscus.error && giscus.error !== "Discussion not found")) {
      done();
    }
  });
  setTimeout(done, 10000);
}

// A content image's skeleton (basic.sass) shimmers only while on screen: a moving background repaints its
// image every frame, and a long post holds dozens of skeletons below the screen. An image that has arrived
// has no skeleton left to watch
function setup_image_skeletons() {
  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.target.hasAttribute("data-skeleton")) {
        observer.unobserve(entry.target);
        return;
      }
      entry.target.toggleAttribute("data-on-screen", entry.isIntersecting);
    });
  });
  document.querySelectorAll("img[data-skeleton]").forEach(function(img) {
    observer.observe(img);
  });
}

// The Testbed's puzzles shine together (basic.sass), but a browser starts an image's shine when it draws
// it: a row the Manifest's list moves or shows again, a menu or a folded list as it opens. Each shine is
// set to the page's own clock as it starts, so every puzzle sweeps at once
function sync_puzzle_shines() {
  document.addEventListener("animationstart", function(event) {
    if (event.animationName === "puzzle-shine") {
      event.target.getAnimations().forEach(function(animation) {
        animation.startTime = 0;
      });
    }
  });
}

// The header on every page stays at the top of the screen, and once the page leaves the top the logo's
// black box spreads over it (header.sass). Below 768px its Menu button opens the page's menu from the
// right, with the site's links on top: the Manifest's side panel, or a post's menu with its side panel.
function setup_header() {
  const header = document.querySelector("body > header");
  const logo = header.querySelector(".title-main");
  // the side panel sits below the header, so its height is kept in a CSS variable; the black spreads
  // from the logo's box, kept as distances from the header's edges
  function measure() {
    document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
    const right = header.clientWidth - logo.offsetLeft - logo.offsetWidth;
    const bottom = header.clientHeight - logo.offsetTop - logo.offsetHeight;
    header.style.setProperty("--logo-inset", [logo.offsetTop, right, bottom, logo.offsetLeft].join("px ") + "px");
  }
  // measured before data-scroll is first set, which brings in the black layer: one that appeared before
  // the measure would spread from nowhere to the logo
  measure();
  const resize = new ResizeObserver(measure);
  resize.observe(header);
  resize.observe(logo);
  function mark_scroll() {
    header.dataset.scroll = window.scrollY > 0 ? "down" : "top";
  }
  window.addEventListener("scroll", mark_scroll, { passive: true });
  mark_scroll();

  const menu = document.querySelector(".site-menu");
  if (!menu) {
    return;
  }
  menu.prepend(header.querySelector("nav").cloneNode(true));
  // a post's side panel (setup_post_panel), which the menu shows in its place on phones (header.sass)
  const panel = document.getElementById("post-side");
  if (panel) {
    const copy = panel.cloneNode(true);
    copy.removeAttribute("id");
    menu.append(copy);
  }
  const button = header.querySelector(".site-menu-button");
  button.setAttribute("popovertarget", menu.id);
  // a tap outside the open menu only closes it: the browser closes it as the finger comes down or lifts,
  // and the click after that, on a row or a link under the menu, does nothing. The X's own click, the menu
  // still open, closes it; a finger that comes down just beside the 20px X closes the menu the same way,
  // and Safari then moves the click onto the X, which would open it again. A keyboard's click has no
  // count (detail 0)
  let began_open = false;
  document.addEventListener("pointerdown", function() {
    began_open = menu.matches(":popover-open");
  }, true);
  document.addEventListener("click", function(event) {
    if (event.detail && began_open && !menu.matches(":popover-open") && !menu.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
    began_open = false;
  }, true);
  // a popover below 768px only: from there the panel is back beside the list, where the browser's
  // popover styles would hide it, and one left open closes as the attribute goes
  const wide = matchMedia("(min-width: 768px)");
  function place() {
    // with the slide off: Safari keeps a panel that becomes a closed popover drawn just off the screen,
    // its slide-out never ending (header.sass), where the keyboard's Tab still reached its controls
    menu.style.transition = "none";
    menu.toggleAttribute("popover", !wide.matches);
    getComputedStyle(menu).display;
    menu.style.transition = "";
  }
  wide.addEventListener("change", place);
  place();
  // a link in the panel leaves the page, or goes to a part of it the open panel would cover
  menu.addEventListener("click", function(event) {
    if (event.target.closest("a") && menu.matches(":popover-open")) {
      menu.hidePopover();
    }
  });
}

function generate_figure_numbers() {
  try {
    const figcaptions = document.getElementsByTagName("figcaption");

    const fig_key = "fig";
    const figcaptions_per_class = {};
    for (let j = 0; j < figcaptions.length; j++) {
      const figcaption = figcaptions[j];
      const figcaption_name = figcaption.classList.value;
      const key = figcaption_name.length === 0 ? fig_key : figcaption_name;
      if (!figcaptions_per_class.hasOwnProperty(key)) {
        figcaptions_per_class[key] = [];
      }
      figcaptions_per_class[key].push(figcaption);
    }

    const nofig_key = "nofig";
    for (const key in figcaptions_per_class) {
      const each_figcaptions = figcaptions_per_class[key];
      const key_first_uppercase = key.charAt(0).toUpperCase() + key.slice(1);
      for (let i = 0; i < each_figcaptions.length; i++) {
        const fig_num = i + 1;
        const each_figcaption = each_figcaptions[i];

        if (key !== nofig_key) {
          each_figcaption.innerHTML = key_first_uppercase + " " + String(fig_num) + ": " + each_figcaption.innerHTML;
        }
      }
    }
  } catch (e) {
    console.error("Figure numbering failed:", e);
  }
}
