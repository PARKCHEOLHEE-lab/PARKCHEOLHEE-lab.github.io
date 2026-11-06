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

// The Manifest list: one button per post type (each row's emoji) shows only that type, and the
// type / title / date headers reorder the rows, a second click reversing the order. Pinned rows
// stay on top, and the build order (newest first) is the starting state.
function setup_note_list() {
  const list = document.getElementById("note-list");
  const filter_bar = document.getElementById("note-type-filter");
  const sort_buttons = document.querySelectorAll("[data-note-sort]");
  const PIN = "/emoji/pin.png";

  const rows = Array.from(list.querySelectorAll(".note-post-item")).map(function(item, index) {
    return {
      item: item,
      index: index,
      type: item.querySelector(".emoji-image").getAttribute("src"),
      title: item.querySelector(".post-title").textContent.trim(),
      time: Date.parse(item.querySelector("time").getAttribute("datetime"))
    };
  });
  const types = [];
  rows.forEach(function(row) {
    if (!types.includes(row.type)) {
      types.push(row.type);
    }
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const state = { type: null, key: "date", descending: true };

  function compare(a, b) {
    const pinned = (b.type === PIN) - (a.type === PIN);
    if (pinned !== 0) {
      return pinned;
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
      const shown = state.type === null || row.type === state.type;
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

    filter_bar.classList.toggle("is-filtered", state.type !== null);
    filter_bar.querySelectorAll("button").forEach(function(button) {
      button.setAttribute("aria-pressed", String(button.dataset.type === state.type));
    });
    sort_buttons.forEach(function(button) {
      const active = button.dataset.noteSort === state.key;
      button.setAttribute("aria-pressed", String(active));
      button.querySelector(".note-sort-arrow").textContent = active ? (state.descending ? " ↓" : " ↑") : "";
    });
  }

  types.forEach(function(type) {
    const name = type.split("/").pop().replace(".png", "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-control clickable";
    button.dataset.type = type;
    button.title = name;
    button.setAttribute("aria-label", name);
    const image = document.createElement("img");
    image.src = type;
    image.alt = "";
    image.className = "emoji-image";
    button.appendChild(image);
    button.addEventListener("click", function() {
      state.type = state.type === type ? null : type;
      render();
    });
    filter_bar.appendChild(button);
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
