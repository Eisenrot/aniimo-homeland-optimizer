# Pages source package

GitHub's contents path is text-oriented, while the tested standalone build is kept byte-identical to the locally validated package.

The numbered `chunk00` through `chunk08` files are consecutive Base64 slices of that package. The Pages workflow concatenates them, decodes them, verifies this SHA-256, and only then deploys:

`dcc42854418cc40e9ed3261b06f6a1ce17dd936aad8e6e2b504bea35363f4c80`

This is deliberately boring. Boring deployment machinery is good deployment machinery.
