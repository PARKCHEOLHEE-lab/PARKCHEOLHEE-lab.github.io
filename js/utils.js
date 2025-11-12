function handle_click(event, url) {
        if (event.ctrlKey || event.metaKey) {
        // open in new tab if `ctri + click`
        window.open(url, '_blank');
        } else {
        location.href = url;
        }
  }


function handle_image_error(img) {
    // image hosting with lfs
    const original_src = img.src;

    if (original_src.includes("media.githubusercontent.com")) return;

    const dev = "dev/";
    const main = "main/";
    const url = "https://media.githubusercontent.com/media/PARKCHEOLHEE-lab/PARKCHEOLHEE-lab.github.io/refs/heads/";

    try {
        const github_media_url_main = `${url}${dev}${img.src.split("/").slice(-3).join("/")}`;
        img.src = github_media_url_main;
    } catch (error) {
        const github_media_url_dev = `${url}${main}${img.src.split("/").slice(-3).join("/")}`;
        img.src = github_media_url_dev;
    }
}


function resize_iframe(obj) {
    obj.style.height = obj.contentWindow.document.documentElement.scrollHeight + 'px';
    document.getElementById('notebook-container').style.height = obj.style.height;
}


function generate_table_of_contents() {
    let toc = "<ul class='section-nav'>";

    const h3h4_tags = document.querySelectorAll("h3, h4");
    for (const h_tag of h3h4_tags) {
      h_tag.id = h_tag.innerText.toLowerCase().replaceAll(" ", "-");
    }

    for (const h_tag of h3h4_tags) {
      if (h_tag.nodeName === "H3") {
        toc += "<li><a href=\"#" + h_tag.id + "\">" + h_tag.innerText + "</a></li>";
      } else {
        toc += "<ul><li><a href=\"#" + h_tag.id + "\">" + h_tag.innerText + "</a></li></ul>"
      }
    }

    toc += "</ul><br><br>";
    document.getElementById("toc").innerHTML += toc;
}


function generate_figure_numbers() {
    const figcaptions = document.getElementsByTagName("figcaption");
    
    const fig_key = "fig"
    const figcaptions_per_class = {};
    for (const figcaption of figcaptions) {
      const figcaption_name = figcaption.classList.value;
      if (figcaption_name.length === 0) {
        if (!figcaptions_per_class.hasOwnProperty(fig_key)) {
          figcaptions_per_class[fig_key] = [];
        }
        figcaptions_per_class[fig_key].push(figcaption);
      } else {
        if (!figcaptions_per_class.hasOwnProperty(figcaption_name)) {
            figcaptions_per_class[figcaption_name] = [];
        }
        figcaptions_per_class[figcaption_name].push(figcaption);
      }
    }

    const nofig_key = "nofig"
    for (const key in figcaptions_per_class) {
      const each_figcations = figcaptions_per_class[key];
      const key_first_uppercase = key.charAt(0).toUpperCase() + key.slice(1)
      for (let i = 0; i < each_figcations.length; i++) { 
        const fig_num = i + 1;
        const each_figcation = each_figcations[i];

        if (key !== nofig_key) {
          each_figcation.innerHTML = `${key_first_uppercase} ${String(fig_num)}: ${each_figcation.innerHTML}`
        }
      }
    }
  }