# winget manifest

A draft manifest for publishing glance to the [Windows Package Manager community repository](https://github.com/microsoft/winget-pkgs), so it can be installed with:

```powershell
winget install Sammy949.glance
```

It describes the per-user NSIS installer (`glance_<version>_x64-setup.exe`) from a GitHub release. winget runs NSIS installers silently with `/S`.

## Publishing a version

On Windows:

1. Update `PackageVersion`, the `ReleaseNotesUrl`, the `InstallerUrl` and the `InstallerSha256` for the new release. Get the hash with:

   ```powershell
   Get-FileHash .\glance_<version>_x64-setup.exe -Algorithm SHA256
   ```

2. Validate, then test an install from the manifest:

   ```powershell
   winget validate --manifest packaging\winget
   winget settings --enable LocalManifestFiles   # once, as administrator
   winget install --manifest packaging\winget
   ```

3. Copy the three YAML files to `manifests/s/Sammy949/glance/<version>/` in a fork of `microsoft/winget-pkgs` and open a pull request. `wingetcreate update Sammy949.glance --version <version> --urls <installer url>` can do steps 1 and 3 once the first version is accepted.

The installer isn't code-signed, so the winget-pkgs validation may flag it for manual review. That's expected for unsigned installers, and is not a manifest error.
