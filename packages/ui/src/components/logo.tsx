import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 18L9 9L11 12L13 9L18 18" stroke="var(--icon-base)" stroke-width="2.2" stroke-linecap="square" />
      <path d="M4 18H18" stroke="var(--icon-base)" stroke-width="2.2" stroke-linecap="square" />
      <path d="M7 18L11 12" stroke="var(--icon-weak-base)" stroke-width="2.2" stroke-linecap="square" />
      <circle cx="19" cy="14" r="3" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 88L46 40L58 56L70 40L96 88"
        stroke="var(--icon-base)"
        stroke-width="8"
        stroke-linecap="square"
      />
      <path d="M20 88H96" stroke="var(--icon-base)" stroke-width="8" stroke-linecap="square" />
      <path d="M35 88L58 56" stroke="var(--icon-weak-base)" stroke-width="8" stroke-linecap="square" />
      <circle cx="98" cy="70" r="16" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 186 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M12 24H6V30H12V24ZM24 24H18V30H24V24Z" fill="var(--icon-weak-base)" />
        <path
          d="M6 6H0V36H6V6ZM12 24H6V36H12V24ZM18 18H12V30H18V18ZM24 24H18V36H24V24ZM30 6H24V36H30V6Z"
          fill="var(--icon-base)"
        />
        <path d="M42 30H36V18H42V30Z" fill="var(--icon-weak-base)" />
        <path d="M42 6H36V12H42V6ZM42 18H36V36H42V18Z" fill="var(--icon-base)" />
        <path d="M60 12H72V18H60V12ZM48 24H60V30H48V24Z" fill="var(--icon-weak-base)" />
        <path d="M72 12H48V6H72V12ZM54 24H48V12H54V24ZM72 24H48V18H72V24ZM72 30H66V24H72V30ZM72 36H48V30H72V36Z" fill="var(--icon-base)" />
        <path d="M96 30H84V18H96V30Z" fill="var(--icon-weak-base)" />
        <path d="M96 12H84V30H96V36H78V6H96V12Z" fill="var(--icon-strong-base)" />
        <path d="M120 30H108V18H120V30Z" fill="var(--icon-weak-base)" />
        <path d="M120 12H108V30H120V12ZM126 36H102V6H126V36Z" fill="var(--icon-strong-base)" />
        <path d="M150 30H138V18H150V30Z" fill="var(--icon-weak-base)" />
        <path d="M150 12H138V30H150V12ZM156 36H132V6H150V0H156V36Z" fill="var(--icon-strong-base)" />
        <path d="M186 24V30H168V24H186Z" fill="var(--icon-weak-base)" />
        <path d="M168 12V18H180V12H168ZM186 24H168V30H186V36H162V6H186V24Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
