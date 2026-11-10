# Lazy loading and a skeleton box for the site's content images (image_sizes.py), on every write of the
# site, so `jekyll serve` shows them as the deployed site does. A failure stops the build rather than
# publishing pages without them.
Jekyll::Hooks.register :site, :post_write do |site|
  system("python3", File.join(__dir__, "image_sizes.py"), site.dest, exception: true)
end
