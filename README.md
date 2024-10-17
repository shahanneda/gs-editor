#

To run, open up index.html using a server (use VSCode Live Server extension).

Uncomment line in `index.html`

if you want to use compressed loader vs uncompressed loader:
```
	<!-- <script src="src/loader.js"></script> -->
	<script src="src/compressedLoader.js"></script>
```


The only difference is the compressed loader loads a splat file which is in binary and has no spherical harmonics.
See `compressSplat.js` to compress a splat.


Can download sample scenes from:

https://shahanneda-models.s3.us-east-2.amazonaws.com/E7_01_id01-30000.cply

https://shahanneda-models.s3.us-east-2.amazonaws.com/Shahan_03_id01-30000.cply

**To run locally, download these file and place these a newly created `data` folder.**

If you want to use yormal uncompressed versions:

https://shahanneda-models.s3.us-east-2.amazonaws.com/E7_01_id01-30000.ply

https://shahanneda-models.s3.us-east-2.amazonaws.com/Shahan_03_id01-30000.ply

