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
// build order (newest first) is the start.
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
  // the most common type first; types with equal counts keep the order they first appear in
  const types = Object.keys(counts).sort(function(a, b) {
    return counts[b] - counts[a];
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
  }

  // one checkbox per type, with the type's icon, its name and its post count
  types.forEach(function(type) {
    const stem = type.split("/").pop().replace(".png", "");
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
    label.append(box, icon, TYPE_NAMES[stem] || stem.charAt(0).toUpperCase() + stem.slice(1), count);
    filter.appendChild(label);
  });
  filter.addEventListener("change", function(event) {
    if (event.target.checked) {
      state.types.add(event.target.value);
    } else {
      state.types.delete(event.target.value);
    }
    if (state.types.size === 0) {
      types.forEach(function(type) {
        state.types.add(type);
      });
    }
    render();
  });

  sort.addEventListener("change", function(event) {
    state.sort = event.target.value;
    render();
  });

  // below 990px the panel sits above the list (basic.sass), folded so the rows come first
  if (!matchMedia("(min-width: 990px)").matches) {
    panel.querySelectorAll("details").forEach(function(section) {
      section.open = false;
    });
  }
  panel.hidden = false;
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
