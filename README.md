# Electrostatics Lab — Gauss's Law & Electric Field Simulations

Interactive simulations for **AP Physics C: Electricity & Magnetism**. It's a static site with no build step and no external CDNs (three.js and KaTeX are in `vendor/`), so it runs as-is on GitHub Pages.

| Page | What it does |
| --- | --- |
| `index.html` | Home page and a formula/concept sheet that links to each lab |
| `field.html` | **Electric Field Lab**: drag point charges and see field lines, a vector field, equipotentials and a potential heat map. Includes E/V probes, a two-point voltmeter (ΔV and work), Coulomb forces and test-charge motion with an energy-conservation readout. Presets include dipole, quadrupole, capacitor and charged rod. |
| `gauss.html` | **Gauss's Law Lab** (3D): 13 symmetric distributions (point, uniform/non-uniform/conducting spheres, shell, charge in a conducting shell, line, cylinder, coax, sheet, slab, conducting plate, parallel-plate capacitor). Sweep the Gaussian surface and get live Q_enc, flux, E(r) and V(r) graphs plus a step-by-step derivation. |
| `flux.html` | **3D Flux Explorer**: numerically integrates E·dA over a sphere, cube, cylinder, ellipsoid or irregular surface (~40–50k patches, refined near charges), so you can check that Φ = Q_enc/ε₀ for any shape. |
| `distributions.html` | **Continuous charges**: rod, ring, disk and arc. Shows the dq pieces, the dE vectors, the tip-to-tail sum and how the Riemann sum converges to the exact integral. |

## Publishing on GitHub Pages

1. Go to the repository's **Settings → Pages**.
2. Under **Build and deployment**, set *Source* to **Deploy from a branch**.
3. Pick the branch that contains these files and the **/ (root)** folder, then click **Save**.
4. After a minute or so the site is live at `https://<user>.github.io/<repo>/`.

## Running locally

ES modules need an HTTP server, so opening the files directly from disk won't work:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Accuracy

Every field comes from Coulomb's law or Gauss's law. The Gauss lab computes E as Q_enc / (ε₀ × area), and the analytic results were checked against textbook formulas. The flux integrator matches q/ε₀ to better than 0.1 % even 5 cm from the surface. The continuous-distribution sums converge to the closed-form integrals.
