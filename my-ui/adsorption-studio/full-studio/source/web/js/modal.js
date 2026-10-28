// One modal dialog shared by the page (preset library, enlarged charts).

import { $, hide } from "./util.js";

export function openModal(content, cls = "") {
  const modal = $("#modal");
  $(".modal-dialog", modal).className = `modal-dialog${cls ? " " + cls : ""}`;
  $(".modal-body", modal).replaceChildren(content);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  $(".close", modal).focus();
}

export function closeModal() {
  const modal = $("#modal");
  modal.classList.remove("open");
  hide(modal);
}

export function initModal() {
  const modal = $("#modal");
  $(".close", modal).addEventListener("click", closeModal);
  $(".modal-backdrop", modal).addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
  });
}
