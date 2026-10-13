# Afyatrust

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Known issues

### API responses happen without clicking a button or making a request

In some parts of the app, workspaces load data automatically when the page opens or when related state changes, even if the user did not click a button. This is intentional for dashboards and live sections, but it can look like the API is responding on its own.

Common causes:
- Dashboards and patient lists fetch data in `ngOnInit` and poll in the background.
- Some actions refresh related data after a save, so a new API call may appear right after a mutation.
- Backend-linked blockchain sections may trigger extra checks or refreshes on load.

If you are debugging unexpected requests:
1. Open browser DevTools and check the **Network** tab.
2. Look for repeated requests after page load or after another action completes.
3. Check whether the request is from an initial load, a poll interval, or a post-save refresh.

If an endpoint is being called when it should not be, the likely fix is in the component's load/poll logic, not in the backend alone.

## Running unit tests

To execute unit tests, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
