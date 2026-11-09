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
      if (i + 1 === branches.length - 1) {
        img.onerror = null;
      }
      return;
    }
  }
  img.onerror = null;
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
// checked types' rows, all of them at first, and unchecking the last one checks them all again, as on
// aaro Academy's Resources page (an empty list is a dead end that reads the same as a fresh visit).
// Pinned rows stay on top in their build order under every sort (a pinned page has no date), and the
// build order (newest first) is the start. A press on a type and a drag over others sets them all, and
// a choice other than the start stays in the page's address.
function setup_note_list() {
  const list = document.getElementById("note-list");
  const panel = document.querySelector(".note-filter");
  const filter = document.getElementById("note-type-filter");
  const sort = document.getElementById("note-sort");
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
      time: Date.parse(item.querySelector("time").getAttribute("datetime"))
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
  // the checked types, never empty
  const state = { types: new Set(types), sort: "newest" };

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

  function render() {
    rows.slice().sort(compare).forEach(function(row) {
      row.item.style.display = state.types.has(row.type) ? "" : "none";
      list.appendChild(row.item);
    });

    filter.querySelectorAll("input").forEach(function(box) {
      box.checked = state.types.has(box.value);
    });
    // the browser may bring back the choice of an earlier visit to the page; the rows follow state
    sort.querySelectorAll("input").forEach(function(radio) {
      radio.checked = radio.value === state.sort;
    });
    write_url();
  }

  // the address keeps a choice other than every type and Newest, so a reload or a shared link shows
  // the same list: /manifest/?type=testbed,note&sort=oldest. The plain /manifest/ is the start; replaced,
  // not added, so Back leaves the page instead of undoing each click
  function write_url() {
    const parts = [];
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

  // an address written by hand may name types or a sort that do not exist; those are left out
  function read_url() {
    const params = new URLSearchParams(location.search);
    const wanted = (params.get("type") || "").toLowerCase().split(",");
    const picked = types.filter(function(type) {
      return wanted.includes(names[type].toLowerCase());
    });
    if (picked.length > 0) {
      state.types = new Set(picked);
    }
    const sorts = Array.from(sort.querySelectorAll("input"), function(radio) {
      return radio.value;
    });
    if (sorts.includes(params.get("sort"))) {
      state.sort = params.get("sort");
    }
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
    if (state.types.size === 0) {
      types.forEach(function(type) {
        state.types.add(type);
      });
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

  read_url();
  panel.hidden = false;
  render();
}

// The header on every page stays at the top of the screen, and once the page leaves the top the logo's
// black box spreads over it (header.sass). Below 990px its Menu button opens the Manifest's side panel
// from the right, with the site's links on top.
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

  const menu = document.querySelector(".note-filter");
  if (!menu) {
    return;
  }
  menu.prepend(header.querySelector("nav").cloneNode(true));
  header.querySelector(".site-menu-button").setAttribute("popovertarget", menu.id);
  // a popover below 990px only: from there the panel is back beside the list, where the browser's
  // popover styles would hide it, and one left open closes as the attribute goes
  const wide = matchMedia("(min-width: 990px)");
  function place() {
    menu.toggleAttribute("popover", !wide.matches);
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
