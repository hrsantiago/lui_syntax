function test(self, text)
  if text == '' then
    self:setTextHorizontalAutoResize(true)
  elseif self:getTextSize().width > dpunittopixels('230sp') then
    self:setTextHorizontalAutoResize(false)
    self:setWidth('230sp')

    g_game.doCombat(...)
  end
end