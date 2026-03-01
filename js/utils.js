var SITE_CONFIG = {
  repo_owner: "PARKCHEOLHEE-lab",
  repo_name: "PARKCHEOLHEE-lab.github.io",
  branches: ["dev", "main"],
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
