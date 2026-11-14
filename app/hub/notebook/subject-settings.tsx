"use client";

import type { ShelfApi, ShelfSubject } from "../use-shelf";
import { DeleteNotebook, NotebookSettings, SubjectFacts, SubjectForm } from "./settings";

export function SubjectSettings({ subject, shelf, hub2, canEdit, canDelete, canManage, onClose, onDeleted }: {
  subject: ShelfSubject; shelf: ShelfApi; hub2: boolean; canEdit: boolean;
  canDelete: boolean; canManage: boolean; onClose: () => void; onDeleted: () => void;
}) {
  return <NotebookSettings title={subject.title} onClose={onClose}>
    {canEdit && subject.status !== "archived"
      ? <SubjectForm subject={subject} shelf={shelf} hub2={hub2} canManage={canManage} /> : <SubjectFacts subject={subject} />}
    {canDelete && subject.status !== "archived" && <DeleteNotebook subject={subject} shelf={shelf} onDeleted={onDeleted} />}
  </NotebookSettings>;
}
