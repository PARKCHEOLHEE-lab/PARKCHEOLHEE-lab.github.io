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

// The Manifest list: the funnel over the emoji column opens a menu with the type sort and a checkbox
// per post type (read from each row's emoji, with its post count) that shows or hides that type's
// rows, plus one for all types. The type, title and date sort buttons reorder the rows, a second
// click reversing the order. Pinned rows stay on top in their build order under every sort (a pinned
// page has no date), and the build order (newest first) is the start.
function setup_note_list() {
  const list = document.getElementById("note-list");
  const filter_bar = document.getElementById("note-type-filter");
  const sort_buttons = document.querySelectorAll("[data-note-sort]");
  const menu = document.getElementById("note-type-menu");
  const menu_button = document.querySelector("[popovertarget='note-type-menu']");
  const all_box = menu.querySelector(".note-menu-all");
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
  // the types unchecked in the menu, whose rows are hidden; none at the start
  const state = { hidden: new Set(), key: "date", descending: true };

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
    rows.slice().sort(compare).forEach(function(row) {
      row.item.style.display = state.hidden.has(row.type) ? "none" : "";
      list.appendChild(row.item);
    });

    filter_bar.querySelectorAll("button").forEach(function(button) {
      button.setAttribute("aria-checked", String(!state.hidden.has(button.dataset.type)));
    });
    // the all-types box: checked with every type shown, empty with none, a dash in between
    all_box.setAttribute("aria-checked", state.hidden.size === 0 ? "true" : state.hidden.size === types.length ? "false" : "mixed");
    mark_menu_button(menu.matches(":popover-open"));
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

  // one checkbox, a row of the type menu: the all-types box's box, the type's icon and its post count,
  // the name kept for the tooltip and screen readers. A click shows or hides the type's rows
  function add_chip(type, icon, name, count) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-chip";
    button.setAttribute("role", "checkbox");
    button.dataset.type = type;
    button.title = name;
    button.setAttribute("aria-label", name + ", " + count + " posts");
    const number = document.createElement("span");
    number.className = "note-chip-count";
    number.textContent = count;
    button.append(all_box.querySelector("svg").cloneNode(true), icon, number);
    button.addEventListener("click", function() {
      if (state.hidden.has(type)) {
        state.hidden.delete(type);
      } else {
        state.hidden.add(type);
      }
      render();
    });
    filter_bar.appendChild(button);
  }

  types.forEach(function(type) {
    const stem = type.split("/").pop().replace(".png", "");
    const image = document.createElement("img");
    image.src = type;
    image.alt = "";
    image.className = "note-chip-icon";
    add_chip(type, image, TYPE_NAMES[stem] || stem.charAt(0).toUpperCase() + stem.slice(1), counts[type]);
  });

  sort_buttons.forEach(function(button) {
    button.addEventListener("click", function() {
      const key = button.dataset.noteSort;
      state.descending = key === state.key ? !state.descending : key === "date";
      state.key = key;
      render();
    });
  });

  // the all-types box checks every type, or unchecks them all when every type is checked
  all_box.addEventListener("click", function() {
    if (state.hidden.size === 0) {
      types.forEach(function(type) {
        state.hidden.add(type);
      });
    } else {
      state.hidden.clear();
    }
    render();
  });

  // the funnel is dark while its menu is open, a type is unchecked or the rows are sorted by type
  function mark_menu_button(open) {
    menu_button.dataset.active = String(open || state.hidden.size > 0 || state.key === "type");
  }

  // the menu is a native popover, which closes on Escape or a click outside it. It opens right under
  // the header row, from the funnel's left edge, and closes when a resize would move the funnel.
  // beforetoggle, unlike toggle, fires at once, with the state the menu is about to take
  menu.addEventListener("beforetoggle", function(event) {
    const open = event.newState === "open";
    if (open) {
      const button = menu_button.getBoundingClientRect();
      const row = menu_button.closest(".post-row").getBoundingClientRect();
      menu.style.left = button.left + window.scrollX + "px";
      menu.style.top = row.bottom + window.scrollY + "px";
    }
    mark_menu_button(open);
  });
  window.addEventListener("resize", function() {
    if (menu.matches(":popover-open")) {
      menu.hidePopover();
    }
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
