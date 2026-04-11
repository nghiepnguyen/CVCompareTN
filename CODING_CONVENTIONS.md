# Coding Conventions & Guidelines

This document outlines the coding standards and conventions for the CV Matcher & Optimizer project. Adhering to these guidelines ensures code consistency, readability, and maintainability.

## 1. General Principles

-   **Readability First:** Code is read more often than it is written. Prioritize clear, descriptive naming and logical structure over cleverness or brevity.
-   **Consistency:** Follow the established patterns in the codebase. If a pattern needs updating, update it everywhere.
-   **Type Safety:** Leverage TypeScript's type system to catch errors at compile time. Avoid `any` wherever possible.
-   **Componentization:** Break down complex UIs into smaller, reusable, and focused React components.

## 2. Naming Conventions

### Files and Directories
-   **React Components:** PascalCase (e.g., `MatchScoreDisplay.tsx`, `PrivacyPolicyPage.tsx`).
-   **Utility/Service Files:** camelCase (e.g., `geminiService.ts`, `firebase.ts`).
-   **Directories:** kebab-case or camelCase, but be consistent (e.g., `components`, `services`).

### Variables and Functions
-   **Variables & Functions:** camelCase (e.g., `activeTab`, `handleLogin`, `calculateScore`).
-   **Constants:** UPPER_SNAKE_CASE for global or module-level constants (e.g., `MAX_FILE_SIZE`, `API_ENDPOINT`).
-   **Booleans:** Prefix with `is`, `has`, `should`, or `can` (e.g., `isLoading`, `hasError`, `isModalOpen`).

### Types and Interfaces
-   **Interfaces & Types:** PascalCase (e.g., `UserProfile`, `AnalysisResult`). Do not prefix with `I` or `T`.

## 3. React Best Practices

-   **Functional Components:** Use functional components and Hooks. Avoid class components.
-   **Props:** Destructure props in the function signature for clarity.
    ```tsx
    // Good
    const UserCard = ({ name, role }: UserCardProps) => { ... }
    
    // Bad
    const UserCard = (props: UserCardProps) => { ... props.name ... }
    ```
-   **State Management:** Keep state as close to where it's needed as possible. Lift state up only when necessary for sharing between components.
-   **Effect Dependencies:** Always specify dependencies in `useEffect`, `useMemo`, and `useCallback`. Avoid omitting dependencies to suppress warnings; fix the underlying issue instead.
-   **Event Handlers:** Prefix event handler functions with `handle` (e.g., `handleFileChange`, `handleSubmit`).

## 4. Styling (Tailwind CSS)

-   **Utility Classes:** Use Tailwind utility classes directly in the `className` attribute.
-   **Conditional Styling:** Use the `cn` utility (from `clsx` and `tailwind-merge`) for conditional class names to avoid conflicts.
    ```tsx
    import { cn } from '@/lib/utils'; // Assuming a utils file exists
    
    <div className={cn("p-4 rounded", isActive ? "bg-blue-500" : "bg-gray-200")}>
    ```
-   **Responsive Design:** Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) to build mobile-first layouts.

## 5. TypeScript Usage

-   **Explicit Types:** Define explicit types or interfaces for component props, API responses, and complex state objects.
-   **Avoid `any`:** Use `unknown` if the type is truly unknown, and use type narrowing. Use generics where appropriate.
-   **Enums vs. Union Types:** Prefer string union types over enums for simple sets of values, as they are often easier to work with and compile cleaner.
    ```typescript
    // Prefer
    type Status = 'pending' | 'success' | 'error';
    
    // Over
    enum Status { Pending, Success, Error }
    ```

## 6. Error Handling

-   **Try/Catch:** Wrap asynchronous operations in `try/catch` blocks.
-   **User Feedback:** Always provide clear, actionable feedback to the user when an error occurs (e.g., using toast notifications or error messages in the UI).
-   **Logging:** Log errors to the console (`console.error`) with sufficient context for debugging.

## 7. Comments and Documentation

-   **Why, not What:** Code should be self-documenting regarding *what* it does. Use comments to explain *why* a particular approach was taken, especially for complex logic or workarounds.
-   **JSDoc:** Use JSDoc comments for complex utility functions or services to describe parameters, return types, and behavior.

## 8. File Structure within Components

Organize the contents of a React component file in the following order:
1.  Imports (External libraries, then internal modules, then styles/assets).
2.  Type/Interface definitions (if specific to the component).
3.  Component function declaration.
4.  Hooks (`useState`, `useRef`, `useEffect`, etc.).
5.  Helper functions/Event handlers.
6.  Return statement (JSX).
7.  Exports.
