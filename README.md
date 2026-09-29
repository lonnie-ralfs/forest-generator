# Pinefield

A small, seeded Babylon.js forest playground. Run `npm install`, then `npm run dev` and open the local URL printed by Vite. `npm run build` makes a static production build; `npm run preview` serves it. `npm test` checks ecological placement invariants.

## GitHub Pages

The `.github/workflows/deploy.yml` workflow tests, builds, and publishes the site on pushes to `main`. In the repository's **Settings → Pages**, set the source to **GitHub Actions**. Vite uses relative asset URLs so the bundled tree models and scripts work under the repository's Pages path. Only the generated `dist` folder is deployed.

## Controls

Drag to orbit, scroll to zoom, right-drag to pan. Change parameters and click **Regenerate landscape**. **Random seed** generates a different forest. The camera buttons reset the view or show the landscape from above. **Slope** highlights excluded terrain; **Canopy shade** shows the shade field. Export settings saves the currently generated world's parameters and current lighting and material settings as JSON.

**Tree billboard distance** (180 m by default) replaces distant trees with model-specific billboards captured in-game. Each tree type gets a transparent 1024 × 1024 side render and top render, using its normalized geometry, materials and the scene lights. The upright side plane blends into a horizontal canopy plane from 35° to 65° camera elevation; overhead views use the top capture. Captures are cached, rebuilt for uploaded replacement models, and retain the model footprint and scale. Full geometry remains visible until both captures are ready. The original `tree_card.png` is preserved but no longer used. **Foliage culling distance** (90 m by default) hides all grass, ferns and bushes beyond that camera-to-root distance, including vertical distance. Both controls update immediately and are included in exported settings. Trees crossfade from geometry to cards over the next 30 m after the billboard distance. Small foliage fades over the final 20 m before its culling distance. Each band is capped at 20% of the configured distance. Smooth distance weights drive complementary screen-door dithering, preserving depth and cutout leaves without transparent-instance sorting; slight grain can be visible during a transition.

**Light & depth** updates immediately, without regenerating the forest. Sun shadows have 1K, 2K (default), and 4K quality options. Terrain, trees (including imported GLBs), and bushes cast shadows; all visible plants and terrain receive them. Grass and ferns do not cast shadow maps to reduce cost. The fixed sun uses a cached whole-world shadow map, refreshed after regeneration, model replacement, or shadow-quality changes. Higher quality helps with fine branches and larger worlds; very close views can still reveal shadow-map pixels.

Ambient occlusion uses Babylon's SSAO2 pipeline: half-resolution occlusion, 16 samples, full-resolution bilateral blur, and adjustable strength. It adds contact shading in branches and terrain creases. It requires WebGL 2 with multiple render targets; the control is disabled if unsupported. SSAO is screen-space, so hidden/offscreen geometry cannot contribute and silhouettes may show small halos. Disable AO or reduce shadow resolution for slower GPUs. AO uses the PBR material prepass, so its depth and normals respect the same leaf cutouts and per-instance fade masks as the visible image. This prevents invisible, unfaded geometry from darkening the transition band. Disabling AO releases the prepass and postprocesses.

Billboards receive only 25% of that occlusion at their switch distance, smoothly dropping to 6.25% at three times that distance. Their material carries this strength through the scene-color alpha channel to a customized SSAO combine pass, avoiding an extra mask render. Cutout transparency is preserved. AO on fading geometry also tapers with coverage to avoid a dark seam against the cards; terrain and fully visible geometry retain normal occlusion. With AO off, the card material returns to ordinary opaque output.

## Generation

**Sun intensity** adjusts direct sunlight from 0 to 4 (default 4.0), while ambient sky light remains available. Distant tree captures refresh to match. **Haze color** changes atmospheric fog and its matching sky background. Both controls update live, persist through regeneration, and are included in exported settings.

- Seeded, warped mountain peaks and ridged detail create connected uplands, valleys, forest patches and clearings.
- The **Erosion** slider controls a downhill rainfall-accumulation pass that carves converging channels, followed by 12 thermal-weathering passes that transfer loose material onto lower slopes. This is a lightweight terrain approximation, not a time-dependent hydraulic simulation. Set it to zero to see the unweathered mountains. Exposed slopes and summits become rocky; drainage cuts receive darker mineral soil.
- Jittered grid sampling limits clumping; density thins those candidates. Trees are rejected if the terrain gradient exceeds the selected slope.
- Eight surrounding habitat samples detect exposed forest boundaries, including cliffs and clearings. Edge trees have full lower crowns; interior trees have upper crowns and bare lower branches. This is an approximate habitat boundary, not a sunlight simulation.
- Elevation continuously reduces tree scale, with seeded variation.
- A spatial hash evaluates nearby crowns to estimate shade. Shaded ground becomes brown litter and receives ferns/bushes instead of grass.
- Compact root mounds displace terrain vertices. Trees and plants sample the same height function. The mesh samples that continuous function, so very small mounds may appear softened at the largest world size.

## Models

The two GLBs in `assets/trees_demo` load automatically and are included in production builds. Both `tree_edge_demo.glb` and `tree_interior_demo.glb` include foliage and trunk/branch geometry, grounded at Y=0. The app uses their authored geometry without adding a stand-in trunk. The original GLBs are not modified.

Use either **Tree library** upload to replace that habitat with another local `.glb`. Static multi-mesh models and their materials are supported. Hierarchy transforms are baked; models are centered horizontally, grounded, and normalized to 12 units tall before per-tree scaling. Use complete Y-up trees with the trunk centered. Skinned and morph-target models are rejected because this renderer uses static thin instances. Uploaded files remain local and are not retained after reload; the bundled demo models return on reload. Loading a new model replaces the previous one for that habitat. Blockouts remain as a fallback if a bundled model fails to load.

Terrain, blockouts and imported trees use the PBR material pipeline so they share the same fog response. Authored UI colors and terrain vertex colors are converted to linear space; GLB textures retain the loader's color-space and alpha-cutout settings. **Atmospheric haze** updates immediately (zero disables fog). Fog density scales with world extent. The default haze is 60% with sky blue RGB (124, 210, 254), and ambient occlusion strength defaults to 0.7. Different textures still respond differently to lighting; fog does not indicate a damaged GLB.

## Performance and limits

Plants are GPU thin instances grouped into 48 m spatial chunks for frustum culling. On camera movement or distance changes, per-plant distance checks compact visible geometry and billboard transforms into reusable instance buffers; empty batches are disabled. Chunk bounds conservatively cover all their original plants. Terrain uses a bounded grid (up to 400 × 400 cells); root and shade queries use a spatial hash. Materials are shared, pixel density is capped, and there is no physics. Camera-hidden static tree and bush batches preserve the cached whole-world sun shadows across distance changes, at the cost of extra geometry/buffer memory; culled bushes retain their baked shadows. Ambient occlusion uses additional material-prepass attachments and screen-space filtering every frame. Four cached render targets hold the side/top tree captures; they render only on model creation or replacement. The UI exposes 120–600 m worlds and reports allocated visible-pass instance batches and FPS. One batch may use multiple draw calls if the model has multiple materials. The GLB loader is loaded on demand.

This is a blockout foundation, not an infinite-world streamer. There is no occlusion culling or background generation yet; regeneration is synchronous and large worlds can briefly pause rendering. Model polygon counts and material counts directly affect performance. For much larger worlds, add chunk streaming and model-specific impostors before increasing the extent cap.

`src/terrain.js` builds the bounded mountain heightfield and erosion. `src/ecology.js` contains engine-independent forest placement logic. `src/renderer.js` owns Babylon rendering, models and batching. `src/main.js` provides controls. No backend, assets service or API keys are required; the optional web font has local fallbacks.

Babylon reference: [thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/).



**Ground & grass** provides live ground, forest-litter, rock, and grass color pickers, plus separate ground and grass roughness. The matte woodland baseline uses deeper greens and muted stone to complement the trees. Ground colors retain canopy shade, exposed slopes, and erosion variation. Changes update terrain vertex colors without regenerating the world; diagnostic views retain their own palette. Material settings survive regeneration and are exported as JSON. **Reset woodland materials** restores the palette and roughness without changing lighting.
