# Statue sources (not committed: the .glb files are gitignored)

- apollo-daphne-stanetti.glb — "Apollo und Daphne", Giovanni Stanetti, c. 1720,
  Belvedere garden, Vienna. Photogrammetry by www.noe-3d.at, CC0.
  Sketchfab 2d77409f93c249cca9c52a8c54e9607a; fetched from the Objaverse mirror:
  https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-054/2d77409f93c249cca9c52a8c54e9607a.glb
  Includes the pedestal: the bake cuts it off at y = -2.1 (scan units).

Bake: node scripts/bake-statue-chunks.mjs --glb scripts/statue-src/apollo-daphne-stanetti.glb --cut -2.1 --origin-dir -0.6,1,0 --spacing 0.16
  (the break starts at Daphne's raised hand, up and to the left; the statue's highest point is the lyre)

- apollo-daphne-bernini.glb — "Bernini's Apollo and Daphne Baroque", scan by apmcrory on
  Sketchfab, CC BY 4.0 (credit: apmcrory, https://sketchfab.com/3d-models/57333014332a49f4b3346bc73ef7fc16).
  1.38M triangles, closed, no pedestal (the rock base is the sculpture's own).
  Downloaded through the Sketchfab download API with the owner's account token.

Bake: node scripts/bake-statue-chunks.mjs --glb scripts/statue-src/apollo-daphne-bernini.glb --yaw 270 --target 200000
  (yaw 270 is the museum view, Apollo striding in from the left; the break starts at the top, Daphne's fingers turning to laurel; 200k keeps the leaves)

## dante-virgil-shanevm.glb
"Dante and Virgil" by shanevm, CC BY, https://sketchfab.com/3d-models/7554b6e8279145d69244ece953b1abd9
(Bouguereau's 1850 painting as a 3D sculpt, 507k faces, 24 MB; Objaverse glbs/000-135/).
Not baked for the page yet; preview bake was clean (151 chunks, 0 broken loops at --target 150000).
