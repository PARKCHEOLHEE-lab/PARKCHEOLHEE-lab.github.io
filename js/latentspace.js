function pick_weighted_index(weights, rand) {
    if (!weights || weights.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    if (total <= 0) return 0;
    let r = (rand !== undefined ? rand : Math.random()) * total;
    for (let i = 0; i < weights.length - 1; i++) {
        r -= weights[i];
        if (r < 0) return i;
    }
    return weights.length - 1;
}

function pick_least_visited(items) {
    const weights = items.map(function(n) { return 1 / (1 + (n.visits || 0)); });
    return items[pick_weighted_index(weights)];
}

function init_latentspace() {
    const root_style = getComputedStyle(document.documentElement);

    const LABELS = ["Brain", "Books", "Eyes", "Wordballoon", "Robot", "Storm", "Testbed", "Pin", "Note"];
    const LABEL_COLORS = {};
    LABELS.forEach(function(name) {
        LABEL_COLORS[name] = root_style.getPropertyValue("--label-" + name.toLowerCase()).trim();
    });

    const EDGE_COLOR = root_style.getPropertyValue("--edge-color").trim();
    const EDGE_COLOR_DIM = root_style.getPropertyValue("--edge-color-dim").trim();

    const LABEL_EMOJIS = {
        "Brain": "/emoji/brain.png",
        "Books": "/emoji/books.png",
        "Eyes": "/emoji/eyes.png",
        "Wordballoon": "/emoji/wordballoon.png",
        "Robot": "/emoji/robot.png",
        "Storm": "/emoji/storm.png",
        "Testbed": "/emoji/dna.png",
        "Pin": "/emoji/pin.png",
        "Note": "/emoji/default.png"
    };

    const BASE_RADIUS = 3;
    const MIN_ZOOM = 0.9;
    const MAX_ZOOM = 5;
    const VIEWPORT_PAD = 100;
    const IDLE_DELAY = 4000;
    const IDLE_WALK_HIGHLIGHT_DURATION = 2500;
    const IDLE_WALK_TRANSITION_DELAY = 2500;
    const DRIFT_RADIUS = 12;
    const DRIFT_SPEED = 0.001;

    const container = document.getElementById("post-map");
    const is_touch_device = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    let width, height;
    let current_zoom = d3.zoomIdentity;
    let is_panning = false;
    let is_dragging_node = false;
    let drag_moved = false;
    let drag_start_pos = null;
    const TAP_THRESHOLD = 10;
    let active_hover_node = null;
    let touch_selected_node = null;
    let hover_leave_timer = null;
    let hover_enter_timer = null;
    let intent_triangle = null;
    const TOUCH_HIT_RADIUS = 10;

    function get_map_dimensions() {
        const container_width = Math.max(container.clientWidth || 0, 280);
        const container_height = Math.max(container.clientHeight || 0, 260);
        return { width: container_width, height: container_height };
    }

    const initial_size = get_map_dimensions();
    width = initial_size.width;
    height = initial_size.height;

    const svg = d3.select("#post-map")
        .append("svg")
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "auto");

    const g = svg.append("g");

    const tooltip = d3.select("#post-map")
        .append("div")
        .attr("class", "map-tooltip" + (is_touch_device ? " touchable" : ""));

    tooltip.on("click", function(event) {
        event.stopPropagation();
        if (is_touch_device && touch_selected_node) {
            var url = touch_selected_node.url;
            touch_selected_node = null;
            location.href = url;
        } else if (!is_touch_device && active_hover_node) {
            handle_click(event, active_hover_node.url);
        }
    });

    if (is_touch_device) {
        var tooltip_touch_start = null;
        tooltip.node().addEventListener("touchstart", function(event) {
            event.stopPropagation();
            tooltip_touch_start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }, { passive: true });
        tooltip.node().addEventListener("touchend", function(event) {
            event.stopPropagation();
            if (tooltip_touch_start && touch_selected_node) {
                var t = event.changedTouches[0];
                var dx = t.clientX - tooltip_touch_start.x;
                var dy = t.clientY - tooltip_touch_start.y;
                if (dx * dx + dy * dy < TAP_THRESHOLD * TAP_THRESHOLD) {
                    location.href = touch_selected_node.url;
                }
            }
            tooltip_touch_start = null;
        });
    }

    if (!is_touch_device) {
        tooltip.on("mouseenter", function() {
            intent_triangle = null;
            if (hover_leave_timer) {
                clearTimeout(hover_leave_timer);
                hover_leave_timer = null;
            }
        }).on("mouseleave", function() {
            hover_leave_timer = setTimeout(function() {
                hover_leave_timer = null;
                active_hover_node = null;
                clear_hover_state(250);
            }, 80);
        });
    }

    // --- Triangle intent detection (menu-aim pattern) ---

    function tri_sign(x1, y1, x2, y2, x3, y3) {
        return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    }

    function point_in_triangle(px, py, ax, ay, bx, by, cx, cy) {
        var d1 = tri_sign(px, py, ax, ay, bx, by);
        var d2 = tri_sign(px, py, bx, by, cx, cy);
        var d3 = tri_sign(px, py, cx, cy, ax, ay);
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }

    function build_intent_triangle() {
        if (!active_hover_node || is_touch_device) return null;
        var el = tooltip.node();
        if (!el || +tooltip.style("opacity") === 0) return null;
        var rect = container.getBoundingClientRect();
        var pt = new DOMPoint(active_hover_node.x, active_hover_node.y)
            .matrixTransform(g.node().getScreenCTM());
        var dot_x = pt.x - rect.left;
        var dot_y = pt.y - rect.top;
        var tt_left = parseFloat(tooltip.style("left"));
        var tt_top = parseFloat(tooltip.style("top"));
        var tt_w = el.offsetWidth;
        var tt_h = el.offsetHeight;
        var pad = 6;
        return {
            ax: dot_x, ay: dot_y,
            bx: tt_left < dot_x ? tt_left - pad : tt_left + tt_w + pad,
            by: tt_top - pad,
            cx: tt_left < dot_x ? tt_left - pad : tt_left + tt_w + pad,
            cy: tt_top + tt_h + pad
        };
    }

    function is_moving_toward_tooltip(mx, my) {
        if (!intent_triangle) return false;
        var t = intent_triangle;
        return point_in_triangle(mx, my, t.ax, t.ay, t.bx, t.by, t.cx, t.cy);
    }

    function dot_color(d) {
        return LABEL_COLORS[d.label] || LABEL_COLORS["Note"];
    }

    function highlighted_edge_color(d) {
        const color = d3.color(dot_color(d));
        color.opacity = 0.6;
        return color.formatRgb();
    }

    // --- Viewport ---

    function update_viewport() {
        svg
            .attr("viewBox", "0 0 " + width + " " + height)
            .style("height", height + "px");
        zoom.translateExtent([[-VIEWPORT_PAD, -VIEWPORT_PAD], [width + VIEWPORT_PAD, height + VIEWPORT_PAD]]);
    }

    function is_zoom_limit_wheel(event) {
        const t = d3.zoomTransform(svg.node());
        const at_min = t.k <= MIN_ZOOM + 0.01;
        const at_max = t.k >= MAX_ZOOM - 0.01;
        return (at_max && event.deltaY < 0) || (at_min && event.deltaY > 0);
    }

    const zoom = d3.zoom()
        .scaleExtent([MIN_ZOOM, MAX_ZOOM])
        .translateExtent([[-VIEWPORT_PAD, -VIEWPORT_PAD], [width + VIEWPORT_PAD, height + VIEWPORT_PAD]])
        .filter(function(event) {
            if (event.target.classList && event.target.classList.contains("dot")) return false;
            if (event.type !== "wheel") return true;
            return !is_zoom_limit_wheel(event);
        })
        .on("start", function() {
            is_panning = true;
            g.selectAll(".dot").style("pointer-events", "none");
        })
        .on("zoom", function(event) {
            current_zoom = event.transform;
            g.attr("transform", current_zoom);
            g.selectAll(".dot").attr("r", function() { return BASE_RADIUS / current_zoom.k; })
                .attr("stroke-width", is_touch_device ? TOUCH_HIT_RADIUS * 2 / current_zoom.k : 0);
            g.selectAll(".edge").attr("stroke-width", function() { return 0.5 / current_zoom.k; });
        })
        .on("end", function() {
            is_panning = false;
            if (!is_dragging_node) {
                g.selectAll(".dot").style("pointer-events", "auto");
            }
        });

    update_viewport();
    svg.call(zoom).on("dblclick.zoom", null);
    svg.node().addEventListener("wheel", function(event) {
        if (active_hover_node || is_zoom_limit_wheel(event)) {
            event.preventDefault();
        }
    }, { passive: false });

    // --- Zoom controls ---

    const controls = d3.select("#post-map").append("div").attr("class", "zoom-controls");

    controls.append("button").attr("class", "zoom-btn").html("+")
        .on("click", function() { svg.transition().duration(300).call(zoom.scaleBy, 1.5); });

    controls.append("button").attr("class", "zoom-btn").html("&minus;")
        .on("click", function() { svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5); });

    const fit_btn = controls.append("button").attr("class", "zoom-btn zoom-btn-fit").html("/");

    // --- Tooltip ---

    function render_tooltip(d) {
        const label = d.label || "Note";
        const el = tooltip.node();
        el.style.width = "";
        tooltip
            .html("<strong>" + d.title + "</strong><br><span style='display:inline-flex;align-items:center;white-space:nowrap'><img src='" + (LABEL_EMOJIS[label] || "/emoji/default.png") + "' style='width:1em;height:1em;margin-right:0.3em'><span>" + label + "</span></span>")
            .style("opacity", 1);

        const label_row = el.querySelector("span");
        const min_width = label_row ? label_row.offsetWidth : 0;
        const full_h = el.offsetHeight;
        let lo = min_width, hi = el.offsetWidth;
        while (hi - lo > 1) {
            const mid = (lo + hi) / 2;
            el.style.width = mid + "px";
            if (el.offsetHeight > full_h) { lo = mid; } else { hi = mid; }
        }
        el.style.width = Math.ceil(hi) + "px";
    }

    function position_tooltip(d) {
        const el = tooltip.node();
        const rect = container.getBoundingClientRect();
        const pt = new DOMPoint(d.x, d.y).matrixTransform(g.node().getScreenCTM());
        const anchor_x = pt.x - rect.left;
        const anchor_y = pt.y - rect.top;
        const gap = 14;
        const show_on_right = (rect.width - anchor_x) >= anchor_x;
        let left = show_on_right ? anchor_x + gap : anchor_x - gap - el.offsetWidth;
        let top = anchor_y - 10;

        left = Math.max(0, Math.min(left, rect.width - el.offsetWidth));
        top = Math.max(0, Math.min(top, rect.height - el.offsetHeight));

        tooltip.style("left", left + "px").style("top", top + "px");
    }

    function show_tooltip(d) {
        render_tooltip(d);
        position_tooltip(d);
        tooltip.style("pointer-events", "auto");
        if (!is_touch_device) tooltip.style("cursor", "pointer");
    }

    // --- Data loading ---

    d3.json("/data/latentspace.json").then(function(data) {
        const nodes = data.filter(function(d) { return d.slug.charAt(0) !== "_"; });

        const slug_index = {};
        nodes.forEach(function(d, i) {
            slug_index[d.slug] = i;
            d.nx = d.x;
            d.ny = d.y;
            d.x = d.nx * width;
            d.y = d.ny * height;
        });

        nodes.forEach(function(d) {
            d.tx = d.x;
            d.ty = d.y;
            d.drift_phase_x = Math.random() * Math.PI * 2;
            d.drift_phase_y = Math.random() * Math.PI * 2;
            d.drift_freq_x = 0.7 + Math.random() * 0.6;
            d.drift_freq_y = 0.7 + Math.random() * 0.6;
        });

        const links = [];
        nodes.forEach(function(d) {
            (d.connected || []).forEach(function(target) {
                if (slug_index[target] !== undefined) {
                    links.push({ source: slug_index[d.slug], target: slug_index[target] });
                }
            });
        });

        // --- Highlight helpers ---

        function get_connected_slugs(d) {
            const slugs = new Set();
            links.forEach(function(l) {
                if (l.source === d || l.source.index === d.index) slugs.add(l.target.slug);
                if (l.target === d || l.target.index === d.index) slugs.add(l.source.slug);
            });
            return slugs;
        }

        function apply_highlight(d) {
            const connected = get_connected_slugs(d);

            dot_elements.attr("opacity", function(dd) {
                return (dd.slug === d.slug || connected.has(dd.slug)) ? 1 : 0.1;
            }).attr("r", function(dd) {
                return (dd.slug === d.slug) ? 5 / current_zoom.k : BASE_RADIUS / current_zoom.k;
            });

            link_elements
                .attr("stroke", function(l) {
                    return (l.source === d || l.target === d)
                        ? highlighted_edge_color(d) : EDGE_COLOR_DIM;
                })
                .attr("stroke-width", function(l) {
                    return (l.source === d || l.target === d) ? 0.75 / current_zoom.k : 0.5 / current_zoom.k;
                });
        }

        function clear_hover_state(duration) {
            const dot_sel = duration ? dot_elements.transition().duration(duration) : dot_elements;
            const link_sel = duration ? link_elements.transition().duration(duration) : link_elements;

            dot_sel
                .attr("r", function() { return BASE_RADIUS / current_zoom.k; })
                .attr("opacity", 0.8);

            link_sel
                .attr("stroke", EDGE_COLOR)
                .attr("stroke-width", function() { return 0.5 / current_zoom.k; });

            tooltip.style("opacity", 0).style("pointer-events", "none");
            intent_triangle = null;
            active_hover_node = null;
        }

        // --- Zoom fit ---

        function fit_all(duration) {
            const margin = 20;
            const x0 = d3.min(nodes, function(d) { return d.x; });
            const x1 = d3.max(nodes, function(d) { return d.x; });
            const y0 = d3.min(nodes, function(d) { return d.y; });
            const y1 = d3.max(nodes, function(d) { return d.y; });

            const bw = x1 - x0;
            const bh = y1 - y0;
            if (bw === 0 || bh === 0) return;

            let scale = Math.min((width - margin * 2) / bw, (height - margin * 2) / bh, MAX_ZOOM);
            scale = Math.max(scale, MIN_ZOOM);

            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            const tx = width / 2 - cx * scale;
            const ty = height / 2 - cy * scale;

            const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
            if (duration) {
                svg.transition().duration(duration).call(zoom.transform, transform);
            } else {
                svg.call(zoom.transform, transform);
            }
        }

        function set_initial_min_zoom() {
            const x0 = d3.min(nodes, function(d) { return d.x; });
            const x1 = d3.max(nodes, function(d) { return d.x; });
            const y0 = d3.min(nodes, function(d) { return d.y; });
            const y1 = d3.max(nodes, function(d) { return d.y; });
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            let tx = width / 2 - cx * MIN_ZOOM;
            let ty = height / 2 - cy * MIN_ZOOM;
            const min_tx = width - x1 * MIN_ZOOM;
            const max_tx = -x0 * MIN_ZOOM;
            const min_ty = height - y1 * MIN_ZOOM;
            const max_ty = -y0 * MIN_ZOOM;

            if (min_tx <= max_tx) tx = Math.max(min_tx, Math.min(max_tx, tx));
            if (min_ty <= max_ty) ty = Math.max(min_ty, Math.min(max_ty, ty));

            const transform = d3.zoomIdentity.translate(tx, ty).scale(MIN_ZOOM);
            svg.call(zoom.transform, transform);
        }

        fit_btn.on("click", function() { fit_all(500); });
        svg.on("dblclick", function() { fit_all(500); });

        // --- Simulation ---

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).distance(5).strength(0.2))
            .force("charge", d3.forceManyBody().strength(-2))
            .force("collide", d3.forceCollide(BASE_RADIUS * 1.5))
            .force("x", d3.forceX(function(d) { return d.tx; }).strength(0.3))
            .force("y", d3.forceY(function(d) { return d.ty; }).strength(0.3))
            .alphaDecay(0.02)
            .on("tick", on_tick);

        // --- Render elements ---

        const link_elements = g.append("g").attr("class", "edges")
            .selectAll("line").data(links).enter().append("line")
            .attr("class", "edge")
            .attr("stroke", EDGE_COLOR)
            .attr("stroke-width", 0.5);

        const dot_elements = g.append("g").attr("class", "dots")
            .selectAll("circle").data(nodes).enter().append("circle")
            .attr("class", "dot")
            .attr("r", BASE_RADIUS)
            .attr("fill", dot_color)
            .attr("opacity", 0.8)
            .attr("stroke", "transparent")
            .attr("stroke-width", is_touch_device ? TOUCH_HIT_RADIUS * 2 : 0)
            .style("cursor", "grab")
            .call(d3.drag()
                .on("start", drag_started)
                .on("drag", on_drag)
                .on("end", drag_ended));

        simulation.stop();
        for (var i = 0; i < 300; i++) simulation.tick();
        on_tick();
        simulation.restart();
        fit_all(0);

        // --- Mouse interaction ---

        function activate_hover(d, el) {
            intent_triangle = null;

            if (hover_leave_timer) {
                clearTimeout(hover_leave_timer);
                hover_leave_timer = null;
            }

            active_hover_node = d;
            reset_idle();
            dot_elements.interrupt();
            dot_elements.interrupt("idle");
            link_elements.interrupt();
            link_elements.interrupt("idle");

            d3.select(el).raise().attr("r", 5 / current_zoom.k).attr("opacity", 1);
            apply_highlight(d);
            show_tooltip(d);
        }

        dot_elements
            .on("mouseenter", function(event, d) {
                if (is_dragging_node || is_panning) return;

                if (intent_triangle && active_hover_node && active_hover_node !== d) {
                    var rect = container.getBoundingClientRect();
                    var mx = event.clientX - rect.left;
                    var my = event.clientY - rect.top;
                    if (is_moving_toward_tooltip(mx, my)) return;
                }

                if (!active_hover_node) {
                    activate_hover(d, this);
                    return;
                }

                if (active_hover_node === d) {
                    if (hover_leave_timer) {
                        clearTimeout(hover_leave_timer);
                        hover_leave_timer = null;
                    }
                    return;
                }

                var self = this;
                if (hover_enter_timer) clearTimeout(hover_enter_timer);
                hover_enter_timer = setTimeout(function() {
                    hover_enter_timer = null;
                    activate_hover(d, self);
                }, 150);
            })
            .on("mousemove", function(event, d) {
                if (is_dragging_node || is_panning) return;
                if (active_hover_node === d) position_tooltip(d);
            })
            .on("mouseleave", function(event, d) {
                if (is_dragging_node) return;

                if (hover_enter_timer && active_hover_node !== d) {
                    clearTimeout(hover_enter_timer);
                    hover_enter_timer = null;
                    return;
                }

                intent_triangle = build_intent_triangle();
                hover_leave_timer = setTimeout(function() {
                    hover_leave_timer = null;
                    active_hover_node = null;
                    clear_hover_state(250);
                }, 80);
            })
            .on("click", function(event, d) {
                if (drag_moved || is_touch_device) return;
                handle_click(event, d.url);
            });

        // --- Empty-canvas click dismiss ---

        svg.on("click.dismiss", function(event) {
            if (event.target.classList && event.target.classList.contains("dot")) return;
            if (tooltip.node().contains(event.target)) return;
            if (active_hover_node || touch_selected_node) {
                touch_selected_node = null;
                active_hover_node = null;
                clear_hover_state(250);
            }
        });

        // --- Tick ---

        function on_tick() {
            nodes.forEach(function(d) {
                d.x = Math.max(BASE_RADIUS, Math.min(width - BASE_RADIUS, d.x));
                d.y = Math.max(BASE_RADIUS, Math.min(height - BASE_RADIUS, d.y));
            });

            link_elements
                .attr("x1", function(l) { return l.source.x; })
                .attr("y1", function(l) { return l.source.y; })
                .attr("x2", function(l) { return l.target.x; })
                .attr("y2", function(l) { return l.target.y; });

            dot_elements
                .attr("cx", function(d) { return d.x; })
                .attr("cy", function(d) { return d.y; });

            if (active_hover_node) position_tooltip(active_hover_node);
        }

        // --- Idle animation ---

        let idle_timer = null;
        let idle_anim_running = false;
        let user_interacting = false;

        function reset_idle() {
            user_interacting = true;
            stop_idle_anim({ preserve_hover: active_hover_node !== null });
            clearTimeout(idle_timer);
            idle_timer = setTimeout(function() {
                user_interacting = false;
                start_idle_anim();
            }, IDLE_DELAY);
        }

        svg.on("mousedown", reset_idle);

        function stop_idle_anim(options) {
            options = options || {};
            idle_anim_running = false;
            dot_elements.interrupt("idle");
            link_elements.interrupt("idle");
            if (!options.preserve_hover) clear_hover_state();
        }

        function start_idle_anim() {
            if (user_interacting || active_hover_node) return;
            idle_anim_running = true;
            idle_walk();
        }

        function idle_highlight_node(d) {
            if (!idle_anim_running || user_interacting) return;

            active_hover_node = d;
            if (is_touch_device) touch_selected_node = d;
            d.visits = (d.visits || 0) + 1;
            const connected = get_connected_slugs(d);

            dot_elements.transition("idle").duration(400)
                .attr("opacity", function(dd) {
                    return (dd.slug === d.slug || connected.has(dd.slug)) ? 1 : 0.1;
                })
                .attr("r", function(dd) {
                    return (dd.slug === d.slug) ? 5 / current_zoom.k : BASE_RADIUS / current_zoom.k;
                });

            link_elements.transition("idle").duration(400)
                .attr("stroke", function(l) {
                    return (l.source === d || l.target === d)
                        ? highlighted_edge_color(d) : EDGE_COLOR_DIM;
                })
                .attr("stroke-width", function(l) {
                    return (l.source === d || l.target === d) ? 0.75 / current_zoom.k : 0.5 / current_zoom.k;
                });

            show_tooltip(d);
        }

        function idle_walk() {
            const nodes_with_edges = nodes.filter(function(n) {
                return links.some(function(l) {
                    return l.source === n || l.target === n || l.source.index === n.index || l.target.index === n.index;
                });
            });
            if (nodes_with_edges.length === 0) return;

            walk_step(pick_least_visited(nodes_with_edges));
        }

        function walk_step(current) {
            if (!idle_anim_running || user_interacting) return;

            idle_highlight_node(current);

            setTimeout(function() {
                if (!idle_anim_running || user_interacting) return;
                clear_hover_state(300);

                setTimeout(function() {
                    if (!idle_anim_running || user_interacting) return;

                    const neighbors = [];
                    links.forEach(function(l) {
                        if (l.source === current || l.source.index === current.index) neighbors.push(l.target);
                        if (l.target === current || l.target.index === current.index) neighbors.push(l.source);
                    });

                    if (neighbors.length > 0) {
                        walk_step(pick_least_visited(neighbors));
                    } else {
                        idle_walk();
                    }
                }, IDLE_WALK_TRANSITION_DELAY);
            }, IDLE_WALK_HIGHLIGHT_DURATION);
        }

        idle_timer = setTimeout(function() { start_idle_anim(); }, IDLE_DELAY);

        // --- Drift animation ---

        let drift_start = performance.now();
        let drift_raf = null;

        function drift_tick() {
            var t = (performance.now() - drift_start) * DRIFT_SPEED;
            nodes.forEach(function(d) {
                if (d.fx != null) return;
                var base_x = d.nx * width;
                var base_y = d.ny * height;
                d.tx = Math.max(BASE_RADIUS, Math.min(width - BASE_RADIUS, base_x + Math.sin(t * d.drift_freq_x + d.drift_phase_x) * DRIFT_RADIUS));
                d.ty = Math.max(BASE_RADIUS, Math.min(height - BASE_RADIUS, base_y + Math.sin(t * d.drift_freq_y + d.drift_phase_y) * DRIFT_RADIUS));
            });

            simulation.force("x").x(function(d) { return d.tx; });
            simulation.force("y").y(function(d) { return d.ty; });

            if (simulation.alpha() < 0.01) {
                simulation.alpha(0.02).restart();
            }

            drift_raf = requestAnimationFrame(drift_tick);
        }

        drift_raf = requestAnimationFrame(drift_tick);

        // --- Resize ---

        let resize_frame = null;

        function schedule_resize() {
            if (resize_frame !== null) cancelAnimationFrame(resize_frame);
            resize_frame = requestAnimationFrame(function() {
                resize_frame = null;
                handle_resize();
            });
        }

        if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(function() { schedule_resize(); }).observe(container);
        }

        window.addEventListener("resize", schedule_resize);

        function handle_resize() {
            const next = get_map_dimensions();
            if (next.width === width && next.height === height) return;

            const scale_x = next.width / width;
            const scale_y = next.height / height;
            width = next.width;
            height = next.height;
            update_viewport();

            nodes.forEach(function(d) {
                d.tx = d.nx * width;
                d.ty = d.ny * height;
                d.x *= scale_x;
                d.y *= scale_y;
                d.vx = (d.vx || 0) * scale_x;
                d.vy = (d.vy || 0) * scale_y;
                if (d.fx != null) d.fx *= scale_x;
                if (d.fy != null) d.fy *= scale_y;
            });

            simulation.force("x").x(function(d) { return d.tx; });
            simulation.force("y").y(function(d) { return d.ty; });
            simulation.alphaTarget(0).alpha(0.35).restart();
            on_tick();
            fit_all(0);
        }

        // --- Drag ---

        function drag_started(event, d) {
            active_hover_node = null;
            reset_idle();
            clear_hover_state();
            is_dragging_node = true;
            drag_moved = false;
            drag_start_pos = { x: event.x, y: event.y };
            dot_elements.style("pointer-events", "none");

            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            d3.select(this).style("cursor", "grabbing").style("pointer-events", "auto");
        }

        function on_drag(event, d) {
            if (drag_start_pos) {
                var dx = event.x - drag_start_pos.x;
                var dy = event.y - drag_start_pos.y;
                if (dx * dx + dy * dy > TAP_THRESHOLD * TAP_THRESHOLD) {
                    drag_moved = true;
                }
            } else {
                drag_moved = true;
            }
            d.fx = event.x;
            d.fy = event.y;
        }

        function drag_ended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            d3.select(this).style("cursor", "grab");

            var was_tap = !drag_moved;

            requestAnimationFrame(function() {
                is_dragging_node = false;
                drag_moved = false;
                if (!is_panning) dot_elements.style("pointer-events", "auto");
            });

            if (was_tap && is_touch_device) {
                if (touch_selected_node === d) {
                    touch_selected_node = null;
                    handle_click(event.sourceEvent, d.url);
                    return;
                }

                touch_selected_node = d;
                active_hover_node = d;
                reset_idle();
                dot_elements.interrupt();
                dot_elements.interrupt("idle");
                link_elements.interrupt("idle");
                apply_highlight(d);
                show_tooltip(d);
            }
        }
    });
}
