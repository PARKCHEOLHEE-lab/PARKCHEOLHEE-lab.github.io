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

// The Manifest list: filter chips (one per post type, read from each row's emoji, with its post
// count) show only the chosen types, and the Type / Title / Date headers reorder the rows, a second
// click reversing the order. Pinned rows stay on top in their build order under every sort (a pinned
// page has no date), and the build order (newest first) is the start.
function setup_note_list() {
  const list = document.getElementById("note-list");
  const filter_bar = document.getElementById("note-type-filter");
  const sort_buttons = document.querySelectorAll("[data-note-sort]");
  const PIN = "/emoji/pin.png";
  const TYPE_NAMES = { "default": "note", "default-empty": "empty note", "puzzle": "testbed" };

  const rows = Array.from(list.querySelectorAll(".note-post-item")).map(function(item, index) {
    return {
      item: item,
      index: index,
      type: item.querySelector(".emoji-image").getAttribute("src"),
      title: item.querySelector(".post-title").textContent.trim(),
      time: Date.parse(item.querySelector("time").getAttribute("datetime"))
    };
  });
  const counts = {};
  rows.forEach(function(row) {
    counts[row.type] = (counts[row.type] || 0) + 1;
  });
  // the most common type first; types with equal counts keep the order they first appear in
  const types = Object.keys(counts).sort(function(a, b) {
    return counts[b] - counts[a];
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const state = { types: new Set(), key: "date", descending: true };

  function compare(a, b) {
    if (a.type === PIN || b.type === PIN) {
      return (b.type === PIN) - (a.type === PIN) || a.index - b.index;
    }
    let order = 0;
    if (state.key === "date") {
      order = a.time - b.time;
    } else if (state.key === "title") {
      order = collator.compare(a.title, b.title);
    } else {
      order = types.indexOf(a.type) - types.indexOf(b.type);
    }
    if (state.descending) {
      order = -order;
    }
    return order !== 0 ? order : a.index - b.index;
  }

  function render() {
    let last_shown = null;
    rows.slice().sort(compare).forEach(function(row) {
      const shown = state.types.size === 0 || state.types.has(row.type);
      row.item.style.display = shown ? "" : "none";
      row.item.querySelector(".post-row").classList.add("use-bottom-line");
      list.appendChild(row.item);
      if (shown) {
        last_shown = row;
      }
    });
    if (last_shown !== null) {
      last_shown.item.querySelector(".post-row").classList.remove("use-bottom-line");
    }

    filter_bar.querySelectorAll("button").forEach(function(button) {
      const type = button.dataset.type;
      button.setAttribute("aria-pressed", String(type === "" ? state.types.size === 0 : state.types.has(type)));
    });
    sort_buttons.forEach(function(button) {
      const active = button.dataset.noteSort === state.key;
      const label = button.querySelector("span").textContent;
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        button.dataset.direction = state.descending ? "desc" : "asc";
        button.setAttribute("aria-label", label + (state.descending ? ", descending" : ", ascending"));
      } else {
        delete button.dataset.direction;
        button.setAttribute("aria-label", label);
      }
    });
  }

  // one chip: an icon (or the word All) and a post count; the All chip, with type null, clears the choice
  function add_chip(type, content, name, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-chip";
    button.dataset.type = type === null ? "" : type;
    button.title = name;
    button.setAttribute("aria-label", name + ", " + count + " posts");
    const number = document.createElement("span");
    number.className = "note-chip-count";
    number.textContent = count;
    button.append(content, number);
    button.addEventListener("click", function() {
      if (type === null) {
        state.types.clear();
      } else if (state.types.has(type)) {
        state.types.delete(type);
      } else {
        state.types.add(type);
      }
      render();
    });
    filter_bar.appendChild(button);
  }

  const all_label = document.createElement("span");
  all_label.textContent = "All";
  add_chip(null, all_label, "all", rows.length);
  types.forEach(function(type) {
    const stem = type.split("/").pop().replace(".png", "");
    const image = document.createElement("img");
    image.src = type;
    image.alt = "";
    image.className = "note-chip-icon";
    add_chip(type, image, TYPE_NAMES[stem] || stem, counts[type]);
  });

  sort_buttons.forEach(function(button) {
    button.addEventListener("click", function() {
      const key = button.dataset.noteSort;
      state.descending = key === state.key ? !state.descending : key === "date";
      state.key = key;
      render();
    });
  });

  document.getElementById("note-controls").hidden = false;
  render();
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
