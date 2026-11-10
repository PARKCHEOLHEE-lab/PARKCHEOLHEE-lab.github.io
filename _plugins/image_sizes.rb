# Lazy loading and a skeleton box for the site's content images (image_sizes.py), on every write of the
# site, so `jekyll serve` shows them as the deployed site does. Only the HTML pages Jekyll rendered are
# passed: they carry the site's layout, and so its skeleton styles. A failure stops the build rather than
# publishing pages without them.
Jekyll::Hooks.register :site, :post_write do |site|
  pages = (site.pages + site.documents).select { |page| page.write? && page.output_ext == ".html" }
  system("python3", File.join(__dir__, "image_sizes.py"), site.dest,
         *pages.map { |page| page.destination(site.dest) }, exception: true)
end
