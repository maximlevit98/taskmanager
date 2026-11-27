import { platforms, platformLabel } from "@/lib/catalog";
import type { Account } from "@/lib/content";
import type { MemberRow } from "@/lib/projects";

export function AccountFields({ account, members, linked = false }: {
  account?: Account;
  members: MemberRow[];
  linked?: boolean;
}) {
  return (
    <>
      {linked && account ? (
        <div>
          <b>{platformLabel(account.platform)} · {account.handle}</b>
          <input type="hidden" name="platform" value={account.platform} />
          <input type="hidden" name="handle" value={account.handle} />
          <p className="muted">Площадка и адрес закреплены за связанными материалами. Смена аккаунта в карточке снимает согласование и отметку о выходе. Для другого адреса добавьте отдельный аккаунт.</p>
        </div>
      ) : (
        <>
          {account && <p className="muted">Связанных материалов нет. Изменённые площадка и адрес будут доступны при планировании новых слотов.</p>}
          <label>Площадка
            <select name="platform" defaultValue={account?.platform ?? "instagram"}>
              {platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
            </select>
          </label>
          <label>Аккаунт<input name="handle" defaultValue={account?.handle} placeholder="@brand" required /></label>
        </>
      )}
      <label>Тип аккаунта<input name="kind" defaultValue={account?.kind} placeholder="Основной, канал, страница" /></label>
      <label>Кто выкладывает
        <select name="ownerUserId" defaultValue={account?.owner_user_id ?? ""}>
          <option value="">Не назначен</option>
          {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
        </select>
      </label>
      <label className="check"><input name="connected" type="checkbox" defaultChecked={account?.connected} />Подключён</label>
    </>
  );
}
