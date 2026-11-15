import './day18-selector.css'

// Small start-screen testing panel: choose day 15 or day 18 and set the two
// global variables that day 18 needs. The existing lobby entry buttons still
// start the apartment; they now respect the selected day.

export type DaySelection = {
  day: number
  filmAscuns: boolean
  aDatNumele: boolean
}

export type Day18SelectorOptions = {
  onChange: (selection: DaySelection) => void
}

export function mountDay18Selector(options: Day18SelectorOptions): void {
  const inner = document.querySelector<HTMLElement>('#lobby .lobby__inner')
  if (!inner) {
    console.warn('[day18] Lobby container not found; test selector was not mounted.')
    return
  }

  const section = document.createElement('section')
  section.className = 'day18-test'
  section.setAttribute('aria-label', 'Testare zile')
  section.innerHTML = `
    <div class="day18-test__head">
      <h2 class="day18-test__title">Testare zile</h2>
      <p class="day18-test__status">Ziua selectată: <span data-day-label>15</span></p>
    </div>
    <div class="day18-test__days" role="group" aria-label="Alege ziua">
      <button class="btn btn--ghost day18-test__day" type="button" data-day="15" aria-pressed="true">Ziua 15</button>
      <button class="btn btn--ghost day18-test__day" type="button" data-day="18" aria-pressed="false">Ziua 18</button>
    </div>
    <div class="day18-test__flags">
      <label class="day18-test__flag">
        <input type="checkbox" data-flag="film_ascuns" />
        Filmul e ascuns (ziua 17)
      </label>
      <label class="day18-test__flag">
        <input type="checkbox" data-flag="a_dat_numele" />
        A dat numele (ziua 18)
      </label>
    </div>
    <p class="day18-test__note">
      Alege ziua și variabilele, apoi folosește butoanele de mai sus pentru desktop sau VR.
    </p>
  `

  const footer = inner.querySelector('.foot')
  if (footer) inner.insertBefore(section, footer)
  else inner.append(section)

  const dayLabel = section.querySelector<HTMLElement>('[data-day-label]')
  const dayButtons = [...section.querySelectorAll<HTMLButtonElement>('[data-day]')]
  const film = section.querySelector<HTMLInputElement>('[data-flag="film_ascuns"]')
  const name = section.querySelector<HTMLInputElement>('[data-flag="a_dat_numele"]')
  if (!dayLabel || !film || !name) return

  let selectedDay = 15

  const emit = (): void => {
    options.onChange({
      day: selectedDay,
      filmAscuns: film.checked,
      aDatNumele: name.checked,
    })
  }

  for (const button of dayButtons) {
    button.addEventListener('click', () => {
      const day = Number(button.dataset.day)
      if (!Number.isFinite(day)) return
      selectedDay = day
      dayLabel.textContent = String(day)
      for (const other of dayButtons) {
        other.setAttribute('aria-pressed', String(other === button))
      }
      emit()
    })
  }
  film.addEventListener('change', emit)
  name.addEventListener('change', emit)

  emit()
}
